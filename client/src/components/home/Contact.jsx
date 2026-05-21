import React, { useEffect, useRef, useState } from 'react';

const Contact = () => {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const containerRef = useRef(null);

  useEffect(() => {
    const els = containerRef.current.querySelectorAll('.reveal');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'Email is invalid';
    if (!form.message.trim()) errs.message = 'Message is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    setStatus('sending');
    console.log('Contact form submit:', form);
    setTimeout(() => {
      setStatus('sent');
      setForm({ name: '', email: '', message: '' });
      setTimeout(() => setStatus('idle'), 2500);
    }, 600);
  };

  return (
    <section className="contact-section" ref={containerRef}>
      <div className="contact-grid container">
        <div className="contact-left">
          <h2 className="reveal">Get in touch.</h2>
          <p className="subheading reveal">Have a product you'd like featured, or just want to say something? We read every message.</p>

          <div className="contact-info">
            <div className="info-block reveal">
              <strong>Email</strong>
              <div>
                <a href="mailto:hello@vault.co">hello@vault.co</a>
              </div>
            </div>

            <div className="info-block reveal">
              <strong>Location</strong>
              <div>Auckland, NZ</div>
            </div>
          </div>
        </div>

        <form className="contact-form" onSubmit={handleSubmit} noValidate>
          <input
            className="form-input reveal"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Name"
            aria-label="Name"
          />
          {errors.name && <div className="field-error">{errors.name}</div>}

          <input
            className="form-input reveal"
            name="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email"
            aria-label="Email"
            type="email"
          />
          {errors.email && <div className="field-error">{errors.email}</div>}

          <textarea
            className="form-input reveal"
            name="message"
            value={form.message}
            onChange={handleChange}
            placeholder="Message"
            rows={6}
            aria-label="Message"
          />
          {errors.message && <div className="field-error">{errors.message}</div>}

          <button className="submit-btn reveal" type="submit" disabled={status === 'sending'}>
            {status === 'sent' ? 'Sent ✓' : 'Send Message'}
          </button>
        </form>
      </div>

      <style>{`
        .contact-section { padding: 120px 80px; border-top: 1px solid var(--border); }
        .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; }
        .contact-left h2 { margin-bottom: 12px; }
        .subheading { color: var(--ink-soft); margin-bottom: 28px; }
        .contact-info { display: grid; gap: 14px; margin-top: 18px; }
        .info-block strong { display: block; margin-bottom: 6px; }

        .contact-form { display: flex; flex-direction: column; }
        .form-input { background: var(--white); border: 1px solid var(--border); padding: 14px 18px; border-radius: 4px; margin-bottom: 12px; font-family: var(--font-body); }
        .form-input:focus { border-color: var(--accent); outline: none; }
        .submit-btn { background: var(--ink); color: var(--white); text-transform: uppercase; padding: 12px 18px; border: none; cursor: pointer; font-weight: 500; }
        .submit-btn:hover { background: var(--accent); color: var(--ink); }
        .field-error { color: var(--accent); font-size: 0.9rem; margin-bottom: 8px; }

        /* Reveal animation */
        .reveal { opacity: 0; transform: translateY(12px); transition: opacity 560ms var(--ease-out), transform 560ms var(--ease-out); }
        .reveal.visible { opacity: 1; transform: none; }

        @media (max-width: 768px) {
          .contact-section { padding: 60px 24px; }
          .contact-grid { grid-template-columns: 1fr; gap: 32px; }
        }
      `}</style>
    </section>
  );
};

export default Contact;

