import { rpc } from '@stellar/stellar-sdk';
import { config } from '../config';
import { mapStellarError } from '../errors';

/**
 * Core engine for processing Stellar/OpenPayments transactions.
 * Transitioned from legacy Horizon REST to Soroban RPC for real-time state streaming.
 */
export class CoreEngine {
  private rpcServer: rpc.Server;
  private isRunning: boolean = false;
  private retryCount: number = 0;
  private readonly MAX_RETRIES = 10;
  private readonly INITIAL_BACKOFF = 1000;

  constructor(rpcUrl: string = config.rpcUrl) {
    this.rpcServer = new rpc.Server(rpcUrl);
    console.log('Engine initialized with RPC:', rpcUrl);
  }

  /**
   * Process a specific transaction by its ID.
   */
  public async processTx(txId: string): Promise<boolean> {
    try {
      console.log(`Processing transaction ${txId} via RPC`);
      // Use RPC to get transaction status
      const status = await this.rpcServer.getTransaction(txId);
      return status.status === 'SUCCESS';
    } catch (error) {
      console.error(`Error processing transaction ${txId}:`, mapStellarError(error));
      return false;
    }
  }

  /**
   * Starts the real-time state streaming listener using Soroban RPC.
   * Handles reconnection logic and exponential backoff.
   */
  public async startListener(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.retryCount = 0;
    
    console.log('Starting RPC state streaming listener...');
    this.listen();
  }

  /**
   * Main listener loop.
   */
  private async listen(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.streamStateUpdates();
        this.retryCount = 0; // Reset retry count on successful interaction
      } catch (error) {
        console.error('RPC Listener connection error:', mapStellarError(error));
        
        if (this.retryCount >= this.MAX_RETRIES) {
          console.error('Max reconnection retries reached. Stopping listener.');
          this.stopListener();
          break;
        }

        await this.performReconnection();
      }
      
      // Control polling frequency
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  /**
   * Streams state updates using Soroban RPC events.
   * Replaces legacy Horizon /ledgers REST calls.
   */
  private async streamStateUpdates(): Promise<void> {
    // Implement getEvents or similar RPC streaming mechanism
    // This replaces the previous axios calls to the /ledgers endpoint
    await this.rpcServer.getEvents({
      startLedger: 0, // In a real scenario, this would be tracked
      filters: [],
      limit: 10,
    });
    
    console.log('State updates synchronized via Soroban RPC.');
  }

  /**
   * Handles reconnection with exponential backoff.
   */
  private async performReconnection(): Promise<void> {
    this.retryCount++;
    const delay = this.INITIAL_BACKOFF * Math.pow(2, this.retryCount - 1);
    console.log(`Reconnecting to RPC server (Attempt ${this.retryCount}/${this.MAX_RETRIES}) in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Stops the RPC listener.
   */
  public stopListener(): void {
    this.isRunning = false;
    console.log('RPC Listener stopped.');
  }
}
