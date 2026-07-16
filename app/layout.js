import "./globals.css";

export const metadata = {
  title: "Portail Sous-Officiers",
  description: "Gestion sécurisée des accès et des comptes",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
