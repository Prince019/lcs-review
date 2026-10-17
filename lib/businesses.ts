export type Business = {
  slug: string;
  name: string;
  google_review_url: string;
  logo_letter: string;
  brand_color: string;
};

export const BUSINESSES: Record<string, Business> = {
  laxmi: {
    slug: "laxmi",
    name: "Laxmi Computer Services",
    google_review_url: "https://g.page/r/CbBzFVdUQLUAEBM/review",
    logo_letter: "L",
    brand_color: "#1a73e8",
  },
};

export function getBusiness(slug: string): Business | undefined {
  return BUSINESSES[slug];
}