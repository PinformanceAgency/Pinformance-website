export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string;
  status: "active" | "draft" | "archived";
  images: ShopifyImage[];
  variants: ShopifyVariant[];
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
}

export interface ShopifyVariant {
  id: number;
  title: string;
  price: string;
  sku: string | null;
  image_id: number | null;
}

export interface ShopifyCollection {
  id: number;
  title: string;
  body_html: string | null;
}
