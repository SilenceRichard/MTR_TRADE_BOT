import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import vault from "node-vault";
import axios from "axios";

const vaultClient = vault({
  apiVersion: "v1",
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
});

/**
 * 使用 Vault Transit 进行解密
 */
async function decryptWithVaultTransit(encryptedMnemonic: string): Promise<any> {
  try {
    const response = await axios.post(
      `${process.env.VAULT_ADDR}/v1/transit/decrypt/solana`,
      { ciphertext: encryptedMnemonic },
      {
        headers: {
          "X-Vault-Token": process.env.VAULT_TOKEN,
        },
      }
    );
    // 解码 Base64
    return Buffer.from(response.data.data.plaintext, "base64").toString();
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error message:", error.message);
      console.error("Axios error response:", error.response?.data);
    } else {
      console.error("Vault Transit 解密失败:", error);
    }
    throw new Error("助记词解密失败");
  }
}

/**
 * 获取 Solana 钱包 Keypair
 */
export async function getWallet(): Promise<Keypair> {
  try {
    const walletIndex = 1;
    const path = `m/44'/501'/${walletIndex - 1}'/0'`;

    // 从 Vault 读取加密助记词
    const secret = await vaultClient.read(`${process.env.VAULT_PATH}`);

    const encryptedMnemonic = secret.data.phrase; // ⚠ Vault 存的是加密字符串

    // 使用 Vault Transit 解密
    const mnemonic = await decryptWithVaultTransit(encryptedMnemonic);

    // 生成 Solana Keypair
    const seed = bip39.mnemonicToSeedSync(mnemonic, "");
    const user = Keypair.fromSeed(derivePath(path, seed.toString("hex")).key);

    return user;
  } catch (error) {
    console.error("获取钱包失败:", error);
    throw error;
  }
}
