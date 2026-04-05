export const metadata = {
  title: "DataCrunch — Analyse Financière M&A",
  description: "Plateforme d'analyse financière automatisée pour la due diligence M&A",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: "#F0F4F8" }}>
        {children}
      </body>
    </html>
  );
}
