export const metadata = { title: "DataCrunch — M&A Financial Analysis" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "'Segoe UI', Calibri, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
