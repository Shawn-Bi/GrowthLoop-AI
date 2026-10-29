import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GrowthLoop AI | Content Studio",
  description: "Human-guided content creation, revision, and approval.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
