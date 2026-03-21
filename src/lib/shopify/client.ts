import type { ShopifyProduct } from "./types";

export class ShopifyClient {
  private baseUrl: string;

  constructor(
    private domain: string,
    private accessToken: string
  ) {
    this.baseUrl = `https://${domain}/admin/api/2024-01`;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        "X-Shopify-Access-Token": this.accessToken,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Shopify API error ${res.status}: ${error}`);
    }
    return res.json();
  }

  async getProducts(limit = 250): Promise<{ products: ShopifyProduct[] }> {
    return this.request(`/products.json?limit=${limit}&status=active`);
  }

  async getProduct(id: number): Promise<{ product: ShopifyProduct }> {
    return this.request(`/products/${id}.json`);
  }

  async getCollections(): Promise<{ custom_collections: { id: number; title: string }[] }> {
    return this.request("/custom_collections.json?limit=250");
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.request("/shop.json");
      return true;
    } catch {
      return false;
    }
  }
}
