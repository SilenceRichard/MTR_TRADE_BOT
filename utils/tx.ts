import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

export const buildOptimalTransaction = async (params: {
  transaction: Transaction;
  connection: Connection;
  publicKey: PublicKey;
}) => {
  const { transaction, connection, publicKey } = params;
  if (!publicKey) {
    throw new Error("Public key is required");
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  // 先模拟交易获取实际消耗CU
  const simTx = new VersionedTransaction(
    new TransactionMessage({
      instructions: transaction.instructions,
      recentBlockhash: blockhash,
      payerKey: publicKey,
    }).compileToV0Message()
  );

  const simResult = await connection.simulateTransaction(simTx, {
    sigVerify: false,
  });

  if (simResult.value.err) {
    console.error("Simulation failed:", simResult.value.err);
    throw new Error(`Simulation Error: ${JSON.stringify(simResult.value.err)}`);
  }

  const consumedCU = simResult.value.unitsConsumed || 200_000;

  // 设置额外 buffer 防止失败
  const cuBufferMultiplier = 1.2; // 增加20%的buffer
  const optimalUnits = Math.min(
    Math.ceil(consumedCU * cuBufferMultiplier),
    1_400_000
  );

  // 你可以根据业务需求动态计算优先级费用
  const microLamports = 10; // 或根据网络状态动态调整

  const newComputeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: optimalUnits,
  });
  const newComputePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports,
  });

  // 过滤掉 transaction 中原有的 ComputeBudgetProgram 指令
  const filteredInstructions = transaction.instructions.filter(
    (ix) => !ix.programId.equals(ComputeBudgetProgram.programId)
  );

  const instructions = [
    newComputeLimitIx,
    newComputePriceIx,
    ...filteredInstructions,
  ];

  const opTx = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      recentBlockhash: blockhash,
      payerKey: publicKey,
    }).compileToV0Message()
  );

  return { opTx, blockhash, lastValidBlockHeight, optimalUnits };
};
