import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Band on the Map",
  description: "Find live music where you're going.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
