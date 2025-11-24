import * as anchor from "@coral-xyz/anchor";
import {BN, Program, Wallet} from "@coral-xyz/anchor";
import {PythDemo} from "../target/types/pyth_demo";
import {
    Keypair,
    LAMPORTS_PER_SOL,
    SYSVAR_RENT_PUBKEY,
    SystemProgram,
    Connection, PublicKey,
} from "@solana/web3.js";

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createMint,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

import dotenv from "dotenv";

import {loadKeypairFromFile, requestToken} from "./pyth-demo-helper";

import {InstructionWithEphemeralSigners, PythSolanaReceiver} from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
dotenv.config(); // dotenv-cli injects correct .env

// Keys
const feeAndRentPayerKeypair: Keypair = loadKeypairFromFile(process.env.FEE_AND_RENT_PAYER_KEYPAIR!);
console.log("feeAndRentPayerKeypair: ", feeAndRentPayerKeypair.publicKey.toBase58());

const feedId = process.env.FEED_ID!;
console.log("feedId: ", feedId);

describe("pyth-demo", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const provider = anchor.getProvider() as anchor.AnchorProvider;
    const connection: Connection = provider.connection;

    const wallet = new Wallet(feeAndRentPayerKeypair);

    const pythSolanaReceiver = new PythSolanaReceiver({connection, wallet: wallet as Wallet});

    const priceServiceConnection = new HermesClient(
        "https://hermes.pyth.network/",
        {}
    );

    const program = anchor.workspace.PythDemo as Program<PythDemo>;

    const feedIdAccountAddress: PublicKey = pythSolanaReceiver.getPriceFeedAccountAddress(
        0,
        feedId
    );

    console.log("feedIdAccountAddress: ", feedIdAccountAddress.toBase58());

    it("Setup Accounts", async () => {
        await requestToken(connection, feeAndRentPayerKeypair.publicKey, 20 * LAMPORTS_PER_SOL);
    });

    it("Price Read", async () => {
    // Hermes provides other methods for retrieving price updates. See
    // https://hermes.pyth.network/docs for more information.
        const priceUpdateData = (
            await priceServiceConnection.getLatestPriceUpdates(
                [feedId],
                { encoding: "base64" }
            )
        ).binary.data;

        console.log("priceUpdateData: ", priceUpdateData);

        const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
            closeUpdateAccounts: false,
        });
        await transactionBuilder.addPostPriceUpdates(priceUpdateData);

        console.log(transactionBuilder.transactionInstructions[0]);
        console.log(transactionBuilder.transactionInstructions[1]);

// Use this function to add your application-specific instructions to the builder
        await transactionBuilder.addPriceConsumerInstructions(
            async (
                getPriceUpdateAccount: (priceFeedId: string) => PublicKey
            ): Promise<InstructionWithEphemeralSigners[]> => {
                // Generate instructions here that use the price updates posted above.
                // getPriceUpdateAccount(<price feed id>) will give you the account for each price update.
                return [];
            }
        );

        await pythSolanaReceiver.provider.sendAll(
            await transactionBuilder.buildVersionedTransactions({
                computeUnitPriceMicroLamports: 50000,
            }),
            { skipPreflight: true }
        );

        // // Add your test here.
        // const tx = await program.methods.initialize().rpc();
        // console.log("Your transaction signature", tx);
    });
});
