import React from 'react';
import Nav from './Nav';
import Footer from './Footer';
import WhatsAppButton from './WhatsAppButton';

const Layout = ({ children }) => {
  return (
    <>
      <Nav />
      <main>{children}</main>
      <Footer />
      <WhatsAppButton />
    </>
  );
};

export default Layout;

