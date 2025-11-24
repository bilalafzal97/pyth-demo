import {
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    Connection,
} from "@solana/web3.js";
import {BN} from "@coral-xyz/anchor";
import {u8, u32, u64, bignum} from "@metaplex-foundation/beet";
import {
    createAssociatedTokenAccount,
    getAssociatedTokenAddress,
    mintToChecked,
} from '@solana/spl-token';
import {keccak256} from "ethereum-cryptography/keccak";
import fs from "fs";

export async function requestToken(connection: Connection, receiver: PublicKey, amount: number) {
    await connection.requestAirdrop(receiver, amount);
    await delay(1000);

    console.log("receiver: ", receiver.toBase58());

    console.log("receiver balance: ", (await connection.getBalance(receiver)) / LAMPORTS_PER_SOL);
}

export async function isPdaAddressInitialize(connection: Connection, pdaAddress: PublicKey): Promise<boolean> {
    const pdaAccountInfo = await connection.getAccountInfo(pdaAddress);

    return pdaAccountInfo != null;
}


export function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function mintToken(connection: Connection, feePayer: Keypair, mintAccount: PublicKey, authority: Keypair, receiver: PublicKey, decimal: number, amount: number, tokenProgram: PublicKey, associatedToken: PublicKey) {

    const ata = await getAssociatedTokenAddress(mintAccount, receiver, true, tokenProgram, associatedToken);

    console.log("ata: ", ata.toBase58());

    if (!(await isPdaAddressInitialize(connection, ata))) {
        await createAssociatedTokenAccount(
            connection, // connection
            feePayer, // fee payer
            mintAccount, // mint
            receiver, // owner,
            undefined,
            tokenProgram
        );
    }

    let tokenMintTx = await mintToChecked(
        connection, // connection
        feePayer, // fee payer
        mintAccount, // mint
        ata, // receiver (sholud be a token account)
        authority, // mint authority
        amount,
        decimal, // decimals,
        undefined,
        undefined,
        tokenProgram
    );
    console.log("tokenMintTx: ", tokenMintTx);

}

export function lamportsToTokens(lamports: number, mintDecimals: number): number {
    return lamports / 10 ** mintDecimals;
}

// console.log(lamportsToTokens(2500000000n, 9)); // 2.5 tokens

export function tokensToLamports(amount: number, mintDecimals: number): number {
    // return amount * (10 ** mintDecimals);
    return Math.round(amount * (10 ** mintDecimals));
}

// console.log(tokensToLamports(2.5, 9)); // 2500000000 lamports (2.5 tokens with 9 decimals)

export function codeHash(code: string) {
    return keccak256(Buffer.from(code));
}

export function toU32Bytes(num: number): Uint8Array {
    const bytes = Buffer.alloc(4);
    u32.write(bytes, 0, num);
    return bytes;
}

export function toUtfBytes(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

export function loadKeypairFromFile(filePath: string): Keypair {
    try {
        const secretKeyString = fs.readFileSync(filePath, "utf-8");
        const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
        return Keypair.fromSecretKey(secretKey);
    } catch (err) {
        throw new Error(`Failed to read keypair from ${filePath}: ${err}`);
    }
}