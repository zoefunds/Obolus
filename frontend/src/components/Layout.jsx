import Header from "./Header.jsx";
import Footer from "./Footer.jsx";

export default function Layout({ children }) {
  return (
    <div className="bg-background text-on-surface font-sans min-h-screen selection:bg-primary/30">
      <Header />
      <main className="max-w-container-max-width mx-auto px-margin-mobile md:px-margin-desktop py-12">{children}</main>
      <Footer />
    </div>
  );
}
