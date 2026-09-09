'use client';
import { useState } from 'react';
import Image from 'next/image';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { clientAuth } from '@/lib/firebase/client';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock3, ShieldCheck } from 'lucide-react';
const logo = '/kasas-limited-air-charters-original-logo%202%20(1).png';
export function SignIn() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [reset, setReset] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setMessage('');
    try { if (reset) { await sendPasswordResetEmail(clientAuth(), email); setMessage('If this email has an account, a password reset link will arrive shortly.'); } else await signInWithEmailAndPassword(clientAuth(), email, password); }
    catch (error) { const code = (error as { code?: string }).code; setMessage(code === 'auth/too-many-requests' ? 'Too many attempts. Please wait a little before trying again.' : code === 'auth/network-request-failed' ? 'Unable to connect. Please check your internet connection.' : 'Unable to sign in. Check your email and password, or contact your administrator.'); }
    finally { setBusy(false); }
  }
  return <main className="login-page"><section className="login-story"><Image src={logo} alt="Kasas Limited" width={240} height={99} priority/><div><div className="eyebrow">YOUR WORKDAY, IN VIEW</div><h1>Good work.<br/>Every hour counts<span>.</span></h1><p>A simpler way to keep track of your duty, stay connected to your team, and find your balance.</p><div className="login-feature"><Clock3 size={19}/>One place for your working day.</div></div><small>Air Charter and Air Transport Solutions</small></section><section className="login-form card"><span className="title-icon"><ShieldCheck size={22}/></span><h2>{reset ? 'Reset your password' : 'Welcome back'}</h2><p>{reset ? 'Use the email address linked to your Kasas account.' : 'Sign in with your existing Kasas account.'}</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@kasaskenya.com"/></label>{!reset && <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>}{message&&<p className="form-message" role="status">{message}</p>}<Button type="submit" disabled={busy}>{busy ? 'Please wait…' : reset ? 'Send reset link' : 'Sign in'}<ArrowRight size={17}/></Button></form><button className="text-button" onClick={()=>{setReset(!reset);setMessage('');}}>{reset?'Back to sign in':'Forgot your password?'}</button><a className="text-button" href="/guide">Read the user guide</a><p className="login-footnote">The same account you use for handovers and risk assessments.</p></section></main>;
}
