import type { Metadata } from "next";
import Builder from "@/components/Builder";

export const metadata: Metadata = {
  title: "Create your store · Minute Store",
  description: "Add your Instagram handle and a line about what you do. Get products, INR pricing and copy in about a minute.",
};

export default function CreatePage() {
  return <Builder />;
}
