import Link from 'next/link';
import { Manual } from '@/components/manual';
export default function UserGuide(){return <main className="public-guide"><Link href="/">← Back to DutyTime / Sign in</Link><Manual kind="user"/></main>;}
