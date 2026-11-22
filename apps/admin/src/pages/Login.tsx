import { useState } from 'react';
import { api, ApiError } from '../api';
import { useSession } from '../session';

type Step = 'password' | 'mfa_verify' | 'mfa_enroll';

/**
 * Sign in: email and password, then always a 6 digit code from an
 * authenticator app. The first time, the app is set up by scanning a code.
 */
export function Login() {
  const { refresh } = useSession();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrolment, setEnrolment] = useState<{ qrCode: string; secret: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const signIn = () =>
    run(async () => {
      const result = await api.post<{ next: Step }>('/auth/login', { email, password });
      setPassword('');
      if (result.next === 'mfa_enroll') {
        setEnrolment(await api.post<{ qrCode: string; secret: string }>('/auth/mfa/enroll'));
      }
      setStep(result.next);
    });

  const verify = () =>
    run(async () => {
      await api.post('/auth/mfa/verify', { code });
      await refresh();
    });

  return (
    <main className="login">
      <img src="/logo-96.webp" width={96} height={96} alt="Unity Investment" />
      <h1>Admin sign in</h1>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {step === 'password' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void signIn();
          }}
        >
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Continue
          </button>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          {step === 'mfa_enroll' && enrolment ? (
            <div className="notice">
              <p>
                Set up two step sign in. Open an authenticator app (for example Google Authenticator
                or Microsoft Authenticator), add an account, and scan this code or type the key.
              </p>
              <img
                src={enrolment.qrCode}
                alt="Code to scan with your authenticator app"
                width={200}
                height={200}
              />
              <p>
                Key: <code>{enrolment.secret}</code>
              </p>
            </div>
          ) : (
            <p>Enter the 6 digit code from your authenticator app.</p>
          )}
          <div className="field">
            <label htmlFor="code">Code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={busy || code.length !== 6}>
            Sign in
          </button>
        </form>
      )}
    </main>
  );
}
