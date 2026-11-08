import { useBrand } from '../lib/brand'

export default function Legal({ kind }: { kind: 'privacy' | 'terms' }) {
  const brand = useBrand()
  return (
    <main className="mx-auto min-h-full max-w-xl space-y-4 px-6 py-8 text-sm leading-relaxed text-silver-100">
      <a href="#/" className="text-gold-200">&larr; Home</a>
      {kind === 'privacy' ? (
        <>
          <h1 className="font-display text-3xl text-gold-200">Privacy policy</h1>
          <p>{brand.name} lets you chat with a username instead of your real name. We try to collect only what the service needs.</p>
          <h2 className="text-lg text-gold-200">What we store</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your email address and a protected password, for sign-in and recovery. Other users cannot see your email.</li>
            <li>Your username, optional profile photo, and the private names you give to other people.</li>
            <li>Your messages, reactions, and the photos and voice notes you send. The text of recent messages is also saved on your own device so you can read it offline, and is removed when you sign out.</li>
            <li>Blocks and reports you make, and a notification address for your device if you turn on notifications.</li>
          </ul>
          <h2 className="text-lg text-gold-200">Who can access it</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Messages are protected in transit and at rest, but they are not end-to-end encrypted. The site owner, as the operator of the database, could technically read them. The admin panel does not show message text.</li>
            <li>Our hosting providers (Vercel and Supabase) process data to run the service.</li>
            <li>Notifications only say that a new message arrived and from which username. They never contain message text.</li>
          </ul>
          <h2 className="text-lg text-gold-200">Automatic deletion</h2>
          <p>The administrator may turn on automatic deletion of old messages (after 3 days, 10 days or 1 month). When it is on, a notice appears in the app. Deleted messages and their files cannot be recovered.</p>
          <h2 className="text-lg text-gold-200">Your choices</h2>
          <p>You can delete a message for everyone, delete a whole chat, block or report a person, and delete your account from your Profile page. Deleting your account removes your profile and your messages.</p>
          <p>No messaging service can promise complete anonymity. Do not share information you cannot afford to lose.</p>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl text-gold-200">Terms of service</h1>
          <p>By using {brand.name} you agree to these simple rules.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Be respectful. Do not harass, threaten, scam or impersonate anyone.</li>
            <li>Do not share illegal content or content that exploits or harms children.</li>
            <li>Do not try to break, overload or gain unauthorized access to the service.</li>
            <li>You are responsible for what you send. Reports may be reviewed by the administrator.</li>
            <li>Accounts that break these rules may be suspended or removed.</li>
            <li>The service is provided as is, without guarantees of availability. It is in an early testing stage and may change or stop.</li>
          </ul>
        </>
      )}
    </main>
  )
}