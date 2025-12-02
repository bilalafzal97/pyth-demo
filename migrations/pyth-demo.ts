import * as anchor from "@coral-xyz/anchor";
import {AnchorProvider, BN, Program, Wallet} from "@coral-xyz/anchor";
import {PythDemo, IDL} from "../target/types/pyth_demo";
import {
    Keypair,
    LAMPORTS_PER_SOL,
    SYSVAR_RENT_PUBKEY,
    SystemProgram,
    Connection, PublicKey,
    Commitment
} from "@solana/web3.js";

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMint,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

import dotenv from "dotenv";


import {InstructionWithEphemeralSigners, PythSolanaReceiver} from "@pythnetwork/pyth-solana-receiver";
import {HermesClient} from "@pythnetwork/hermes-client";
import {loadKeypairFromFile} from "../tests/pyth-demo-helper";

dotenv.config(); // dotenv-cli injects correct .env

// Keys
const feeAndRentPayerKeypair: Keypair = loadKeypairFromFile(process.env.FEE_AND_RENT_PAYER_KEYPAIR!);
console.log("feeAndRentPayerKeypair: ", feeAndRentPayerKeypair.publicKey.toBase58());

const feeAndRentPayerWallet = new Wallet(feeAndRentPayerKeypair);

const feedId = process.env.FEED_ID!;
console.log("feedId: ", feedId);

const commitment: Commitment = 'confirmed';

// const connection = new Connection('https://api.testnet.sonic.game', {
//     commitment,
//     wsEndpoint: 'wss://api.testnet.sonic.game'
// });

const connection = new Connection('https://api.devnet.solana.com', {
    commitment,
    wsEndpoint: 'wss://api.devnet.solana.com'
});

const pythSolanaReceiver = new PythSolanaReceiver({connection, wallet: feeAndRentPayerWallet});

const priceServiceConnection = new HermesClient(
    "https://hermes.pyth.network/",
    {}
);

const feedIdAccountAddress: PublicKey = pythSolanaReceiver.getPriceFeedAccountAddress(
    0,
    feedId
);


console.log("feedIdAccountAddress: ", feedIdAccountAddress.toBase58());

const programId = new PublicKey("8xAgQUjq4yURfNbmxN2nf9gZ3NizaGUotUjTWCAWAjaY");
const provider = new AnchorProvider(connection, feeAndRentPayerWallet, AnchorProvider.defaultOptions());
const program: Program<PythDemo> = new Program(IDL, programId, provider);


(async () => {

    const feedIdAccountData = await pythSolanaReceiver.fetchPriceUpdateAccount(feedIdAccountAddress);
    console.log("feedIdAccountData: ", feedIdAccountData);

    console.log("publishTime: ", feedIdAccountData.priceMessage.publishTime.toNumber());

    const blockTime = new BN(await connection.getBlockTime(await connection.getSlot()));

    const last_publish = blockTime.toNumber() - feedIdAccountData.priceMessage.publishTime.toNumber();

    if (last_publish > 1) {
        // Hermes provides other methods for retrieving price updates. See
        // https://hermes.pyth.network/docs for more information.
        const priceUpdateData = (
            await priceServiceConnection.getLatestPriceUpdates(
                [feedId],
                {encoding: "base64"}
            )
        );

        console.log("priceUpdateData: ", priceUpdateData);

        const price = pythPriceToNumber(new BN(priceUpdateData.parsed[0].price.price), priceUpdateData.parsed[0].price.expo);
        console.log("off-chain price: ", price);

        const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
            closeUpdateAccounts: false,
        });
        await transactionBuilder.addPostPriceUpdates(priceUpdateData.binary.data);

// Use this function to add your application-specific instructions to the builder
        await transactionBuilder.addPriceConsumerInstructions(
            async (
                getPriceUpdateAccount: (priceFeedId: string) => PublicKey
            ): Promise<InstructionWithEphemeralSigners[]> => {
                // Generate instructions here that use the price updates posted above.
                // getPriceUpdateAccount(<price feed id>) will give you the account for each price update.

                const priceUpdateAccount = getPriceUpdateAccount(feedId);

                console.log("priceUpdateAccount - from push: ", priceUpdateAccount.toBase58());

                const position = await program.methods.priceRead(feedId).accounts({priceUpdate: priceUpdateAccount}).instruction();

                return [
                    {
                        instruction: position,
                        signers: []
                    }
                ];
            }
        );

        await pythSolanaReceiver.provider.sendAll(
            await transactionBuilder.buildVersionedTransactions({
                computeUnitPriceMicroLamports: 50000,
            }),
            {skipPreflight: true}
        );
    } else {
        const priceReadTx = await program.methods.priceRead(feedId).accounts({priceUpdate: feedIdAccountAddress}).signers([feeAndRentPayerKeypair]).rpc();
    }

})();

function pythPriceToNumber(priceBN: BN, exponent: number): number {
    const priceStr = priceBN.toString(); // BN -> string
    const exponentShift = -exponent;     // exponent is negative (e.g. -8)

    // Insert decimal point manually
    if (exponentShift === 0) {
        return Number(priceStr);
    }

    const len = priceStr.length;

    if (len <= exponentShift) {
        // Example: "12345" with exponent -8 → "0.00012345"
        const padded = priceStr.padStart(exponentShift + 1, "0");
        const result = padded.slice(0, padded.length - exponentShift) +
            "." +
            padded.slice(padded.length - exponentShift);
        return Number(result);
    }

    // Normal case
    const intPart = priceStr.slice(0, len - exponentShift);
    const decPart = priceStr.slice(len - exponentShift);
    return Number(`${intPart}.${decPart}`);
}