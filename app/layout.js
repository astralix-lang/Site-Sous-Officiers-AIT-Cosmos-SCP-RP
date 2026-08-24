import "./globals.css";

export const metadata = {
  title: "Portail Sous-Officiers",
  description: "Gestion sécurisée des accès et des comptes",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
