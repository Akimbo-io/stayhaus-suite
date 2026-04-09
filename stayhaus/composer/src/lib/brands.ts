export interface Brand {
  slug: string;
  name: string;
  website: string;
  languages: string[];
  notion_url: string;
  profile: {
    description: string;
    customer_insights: string;
    desired_outcome: string;
    why_us: string;
    differentiation: string;
    usp: string;
    hard_to_copy: string;
    one_sentence: string;
  };
  guidelines: {
    raw: string;
    colors: { primary: string; accent: string; bg: string };
    fonts: { heading: string; body: string };
    tone: string;
  };
  drive_link: string;
  approver: { name: string; email: string };
  updated_at: string;
}

export interface BrandsDoc {
  version: number;
  updated_at: string;
  brands: Brand[];
}

const BRANDS_URL = 'https://stayhaus.eu/brands.json';

export async function fetchBrands(): Promise<Brand[]> {
  const res = await fetch(BRANDS_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`brands.json fetch failed: ${res.status}`);
  const doc: BrandsDoc = await res.json();
  return doc.brands ?? [];
}
