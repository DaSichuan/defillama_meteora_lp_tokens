import { Connection, PublicKey } from '@solana/web3.js';
import { TokenListProvider } from '@solana/spl-token-registry';
import { addToDBWritesList, getTokenAndRedirectData, } from "../../utils/database";
import { CoinData, Write } from "../../utils/dbInterfaces";
import { getConnection } from "../utils";

import AmmImpl from '@mercurial-finance/dynamic-amm-sdk';
import Decimal from 'decimal.js';


export async function meteora(timestamp: number) {
  const prices = [];
  const pools = [
    {
      symbol: 'SOL-mSOL MLP',
      decimals: 9,
      mint: 'B2uEs9zjnz222hfUaUuRgesryUEYwy3JGuWe31sE9gsG',
      poolAddress: 'HcjZvfeSNJbNkfLD4eEcRBr96AD3w1GpmMppaeRZf7ur',
      tokenAMint: 'So11111111111111111111111111111111111111112',
      tokenBMint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    },
    {
      symbol: 'SOL-bSOL MLP',
      decimals: 9,
      mint: '8ioaL3gTSAhNJy3t9JakXuoKobJvms62Ko5aWHvmHgSf',
      poolAddress: 'DvWpLaNUPqoCGn4foM6hekAPKqMtADJJbJWhwuMiT6vK',
      tokenAMint: 'So11111111111111111111111111111111111111112',
      tokenBMint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
    }
  ];
  const connection = getConnection();
  const writes: Write[] = [];
  for (const pool of pools) {
    const price = await getMeteoraLpPrice(
      connection,
      pool.poolAddress,
      pool.tokenAMint,
      pool.tokenBMint,
      timestamp,
    )
    addToDBWritesList(writes, 'solana', pool.mint, price, pool.decimals, pool.symbol, timestamp, pool.symbol, 0.95)
  }
  return writes;
}

async function getMeteoraLpPrice(
  connection: Connection,
  poolAddress: string,
  tokenAMint: string,
  tokenBMint: string,
  timestamp: number,
): Promise<Decimal> {
  const tlp = await new TokenListProvider().resolve();
  const tokenList = tlp.filterByClusterSlug('mainnet-beta').getList();

  const tokenA = tokenList.find((token) => token.address === tokenAMint)!;
  const tokenB = tokenList.find((token) => token.address === tokenBMint)!;

  const tokenData = await getTokenAndRedirectData([tokenAMint, tokenBMint], 'solana', timestamp)
  const tokenAPrice: (CoinData | undefined) = tokenData.find((c: CoinData) => c.address === tokenAMint);
  const tokenBPrice: (CoinData | undefined) = tokenData.find((c: CoinData) => c.address === tokenBMint);

  const lstPool = await AmmImpl.create(
    connection,
    new PublicKey(poolAddress),
    tokenA,
    tokenB,
  );
  console.log(lstPool)
  const lpMintMultiplier = await connection
    .getTokenSupply(lstPool.poolState.lpMint)
    .then((v) => new Decimal(10 ** v.value.decimals));

  const tokenAMultiplier = new Decimal(10 ** lstPool.tokenA.decimals);
  const tokenBMultiplier = new Decimal(10 ** lstPool.tokenB.decimals);

  const tokenAReserveAmount = new Decimal(
    lstPool.poolInfo.tokenAAmount.toString(),
  ).div(tokenAMultiplier);

  const tokenBReserveAmount = new Decimal(
    lstPool.poolInfo.tokenBAmount.toString(),
  ).div(tokenBMultiplier);

  const totalValueLocked = tokenAReserveAmount
    .mul(new Decimal(tokenAPrice.price))
    .add(tokenBReserveAmount.mul(new Decimal(tokenBPrice.price)));

  const lpSupply = new Decimal(lstPool.poolState.lpSupply.toString()).div(
    lpMintMultiplier,
  );
  return totalValueLocked.div(lpSupply);
}
