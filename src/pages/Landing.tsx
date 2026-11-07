import Logo from '../components/Logo'
import StatusBanner from '../components/StatusBanner'

export default function Landing() {
  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,#142C63_0%,#050B1E_60%)]">
      <StatusBanner />
      <main className="mx-auto flex max-w-xl flex-col items-center px-6 pb-16 pt-10 text-center">
        <div className="logo-float"><Logo size={260} glow /></div>
        <h1 className="mt-10 font-display text-4xl text-gold-200">MER Munshi Chat</h1>
        <p className="mt-3 text-xl text-silver-100">
          Your conversations. Your privacy. Your identity, your choice.
        </p>
        <p className="mt-3 max-w-md text-silver-300">
          Connect, chat, and share in a modern messaging space designed with privacy in mind.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <a href="#/signup" className="btn-gold">Start Chatting</a>
          <a href="#/login" className="btn-ghost">Sign In</a>
        </div>
        <p className="mt-10 max-w-sm text-xs text-silver-500">
          Chat with a username, not your real name. We will explain exactly what data is stored
          before you sign up. No messaging service can promise complete anonymity.
        </p>
        <p className="mt-6 text-xs text-silver-500">
          <a href="#/privacy" className="underline">Privacy policy</a> &middot; <a href="#/terms" className="underline">Terms of service</a>
        </p>
      </main>
    </div>
  )
}
