import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ymir Example",
  description: "Example integration with DLAI auth server",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        {children}
      </body>
    </html>
  );
}
