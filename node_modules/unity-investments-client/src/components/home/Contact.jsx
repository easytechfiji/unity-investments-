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
      { threshold: 0.15 }
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setStatus('sending');
    setErrors({});

    try {
      const base = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${base}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error('Unable to send message');
      }

      setStatus('sent');
      setForm({ name: '', email: '', message: '' });
      setTimeout(() => setStatus('idle'), 2500);
    } catch (error) {
      setStatus('idle');
      setErrors({ form: 'Message could not be sent. Please try again.' });
    }
  };

  return (
    <section className="contact-section" id="contact" ref={containerRef}>
      <div className="contact-grid container">
        <div className="contact-left">
          <h2 className="reveal">Get in touch.</h2>
          <p className="subheading reveal">Have a product you'd like featured, or just want to say something? We read every message.</p>

          <div className="contact-info">
            <div className="info-block reveal">
              <strong>Email</strong>
              <div>
                <a href="mailto:hello@unityinvestment.co">hello@unityinvestment.co</a>
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
          {errors.form && <div className="field-error">{errors.form}</div>}

          <button className="submit-btn reveal" type="submit" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending...' : status === 'sent' ? 'Sent' : 'Send Message'}
          </button>
        </form>
      </div>

      <style>{`
        .contact-section { padding: clamp(72px, 8vw, 120px) 0; background: #f9f7f4; border-top: 1px solid rgba(200,169,110,0.18); scroll-margin-top: 90px; color: var(--ink); }
        .contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 72px; align-items: start; }
        .contact-left,
        .contact-form { min-width: 0; }
        .contact-left h2 { margin-bottom: 16px; font-size: clamp(2.5rem, 5vw, 3.5rem); color: var(--ink); }
        .subheading { color: var(--ink-soft); margin-bottom: 32px; max-width: 520px; }
        .contact-info { display: grid; gap: 18px; margin-top: 22px; color: var(--ink-soft); }
        .info-block { padding-top: 18px; border-top: 1px solid rgba(17,17,17,0.1); }
        .info-block strong { display: block; margin-bottom: 8px; color: var(--ink); }
        .info-block a { color: var(--accent); }

        .contact-form { display: flex; flex-direction: column; gap: 14px; padding: clamp(20px, 4vw, 32px); border: 1px solid rgba(200,169,110,0.22); border-radius: 8px; background: rgba(255,255,255,0.78); box-shadow: 0 22px 60px rgba(17,17,17,0.08); }
        .form-input { width: 100%; background: var(--white); border: 1px solid rgba(17,17,17,0.1); color: var(--ink); padding: 16px 18px; border-radius: 8px; min-height: 54px; }
        .form-input::placeholder { color: var(--ink-muted); }
        .form-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(200,169,110,0.16); }
        .submit-btn { margin-top: 8px; background: var(--blue-dark); color: var(--white); text-transform: uppercase; padding: 16px 18px; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; letter-spacing: 0.1em; transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out), background 220ms var(--ease-out); }
        .submit-btn:hover { transform: translateY(-2px); background: var(--blue); box-shadow: 0 18px 50px rgba(15,23,42,0.16); }
        .field-error { color: #9a6a16; font-size: 0.92rem; margin-bottom: 2px; }

        .reveal { opacity: 0; transform: translateY(12px); transition: opacity 560ms var(--ease-out), transform 560ms var(--ease-out); }
        .reveal.visible { opacity: 1; transform: none; }

        @media (max-width: 768px) {
          .contact-section { padding: 60px 0; }
          .contact-grid { grid-template-columns: 1fr; gap: 42px; }
        }
      `}</style>
    </section>
  );
};

export default Contact;

