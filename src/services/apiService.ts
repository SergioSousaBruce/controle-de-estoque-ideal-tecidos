import { ShoeProduct, ShoeInventory } from '../../types';

/**
 * Service layer for future integration with ERP/external company systems.
 * To connect to the corporate database in the future, modify the base API endpoint
 * and authenticate using the local company tokens.
 */
export class ExternalApiService {
  private static BASE_URL = 'https://api.empresa.com/v1'; // Future endpoint

  /**
   * Fetches the entire shoe products catalog from the main ERP system.
   * Useful for initial load or nightly batch updates.
   */
  static async fetchProductCatalog(apiToken?: string): Promise<ShoeProduct[]> {
    if (!apiToken) {
      console.warn("API Token is not configured. Returning local empty list or fallback.");
      return [];
    }

    try {
      const response = await fetch(`${this.BASE_URL}/products`, {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to retrieve catalog from external API');
      return await response.json();
    } catch (error) {
      console.error("Future Integration API Error (fetchProductCatalog):", error);
      throw error;
    }
  }

  /**
   * Sends the final counted quantities of a completed inventory session to the company ERP.
   */
  static async exportInventorySession(inventory: ShoeInventory, apiToken?: string): Promise<{ success: boolean; transactionId: string }> {
    if (!apiToken) {
      console.warn("API Token not provided. Simulating successful local export preparation.");
      return { success: true, transactionId: `prepared_tx_${Date.now()}` };
    }

    try {
      const response = await fetch(`${this.BASE_URL}/inventories/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inventoryId: inventory.id,
          name: inventory.name,
          employee: inventory.employee,
          date: inventory.date,
          counts: inventory.counts,
          timestamp: Date.now()
        })
      });

      if (!response.ok) throw new Error('Failed to push inventory to external system');
      const data = await response.json();
      return { success: true, transactionId: data.transactionId || `tx_${Date.now()}` };
    } catch (error) {
      console.error("Future Integration API Error (exportInventorySession):", error);
      return { success: false, transactionId: '' };
    }
  }

  /**
   * Quick check to test ERP service health.
   */
  static async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.BASE_URL}/health`);
      return response.ok;
    } catch {
      return false; // Expected to fail currently since BASE_URL is a placeholder
    }
  }
}
