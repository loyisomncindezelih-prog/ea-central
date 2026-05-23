import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ShieldCheck, AlertTriangle } from "lucide-react";

const SECTIONS = [
  {
    title: "1. Acceptance of these terms",
    body: [
      "By creating an account, paying the verification fee, or using any part of ea-central (the \"Service\"), you confirm that you are at least 18 years old and that you have read, understood, and agreed to these Terms & Conditions in full.",
      "If you do not agree with any part of these terms, you must stop using the Service immediately.",
    ],
  },
  {
    title: "2. What ea-central is",
    body: [
      "ea-central is a software platform that lets independent forex mentors host automated trading robots (\"Expert Advisors\") and lets their clients connect MetaTrader 4 or MetaTrader 5 broker accounts to receive copy-trades initiated by the mentor's algorithm.",
      "ea-central is a technology provider only. We do not give financial advice, manage discretionary funds, hold client capital, or accept deposits.",
    ],
  },
  {
    title: "3. Forex trading risk — high-risk warning",
    risk: true,
    body: [
      "Trading foreign exchange (forex), CFDs, indices, commodities, and any other leveraged instrument is highly speculative. Leverage magnifies both gains and losses. You can lose all the capital you deposit with your broker, and in some account types you can lose more than your initial deposit.",
      "Past performance of any mentor, signal, or expert advisor is not indicative of future results. Profit screenshots, backtests, win-rates, and testimonials shown anywhere on this platform are illustrative only and are not a promise or guarantee of any outcome.",
      "You acknowledge that no expert advisor — including those on ea-central — can predict the market. Slippage, spread, broker re-quotes, news events, server downtime, and unforeseen volatility can produce material losses without warning.",
      "Only trade with money you can afford to lose entirely. If you do not understand the risks involved, you should not trade.",
    ],
  },
  {
    title: "4. No financial, legal, or tax advice",
    body: [
      "Nothing on ea-central — including chat messages, dashboard copy, signal text, or any communication from a mentor — constitutes financial, investment, legal, or tax advice. You are solely responsible for any trading decision and its consequences.",
      "Before using the Service, consider obtaining independent advice from a licensed financial professional in your jurisdiction.",
    ],
  },
  {
    title: "5. Payments — strictly non-refundable",
    risk: true,
    body: [
      "The one-time verification fee, mentor subscription fee, and any other amount paid to ea-central are NON-REFUNDABLE under any circumstances once payment has been received and your account has been activated.",
      "By submitting payment you waive any right of withdrawal, refund, chargeback, or cooling-off period that may otherwise apply under your local consumer law, to the maximum extent permitted by law.",
      "If you initiate a chargeback or dispute with your bank against a successful payment, your account will be immediately and permanently terminated and you will be liable for any reversal fees imposed on ea-central.",
      "Payments are processed via manual EFT to the South African bank account displayed on the verification page. Proof of payment must be uploaded and confirmed on WhatsApp.",
    ],
  },
  {
    title: "6. Your broker account & credentials",
    body: [
      "ea-central never accepts deposits. All trading capital sits in your own MetaTrader broker account at all times. You alone control deposits and withdrawals.",
      "You are responsible for the accuracy of the MT4/MT5 server, login number, and investor/master password you provide. Incorrect credentials, insufficient balance, banned IP regions, or restricted instruments at your broker may prevent the EA from executing trades and are not the responsibility of ea-central.",
      "We store the master password encrypted at rest. It is decrypted only when the desktop bridge runs on the mentor's machine to place trades on your behalf.",
    ],
  },
  {
    title: "7. Mentor responsibilities",
    body: [
      "Mentors are independent contractors, not employees or agents of ea-central. The trades they originate and the strategies they choose to deploy are at their sole discretion and risk.",
      "ea-central does not guarantee the accuracy, profitability, or continued availability of any mentor or expert advisor.",
    ],
  },
  {
    title: "8. Trading style choice",
    body: [
      "When you choose a trading style on the mobile app (Aggressive Scalping, Martingale, Scalping, Swing Trading, Day Trading), you are instructing the server to apply a specific risk profile when fanning out signals.",
      "Aggressive Scalping and Martingale are explicitly labelled HIGH RISK. Martingale doubles your position after each losing trade and can wipe out an entire account during a losing streak. Selecting these styles is entirely at your own risk.",
    ],
  },
  {
    title: "9. Service availability",
    body: [
      "We aim for high uptime but make no guarantee of uninterrupted service. Scheduled maintenance, broker outages, internet disruptions, exchange downtime, and force-majeure events may cause the bridge to pause, miss signals, or fail to close positions.",
      "ea-central is not liable for any trade missed, executed late, executed twice, or executed at an unfavourable price due to such events.",
    ],
  },
  {
    title: "10. Limitation of liability",
    body: [
      "To the maximum extent permitted by law, ea-central, its founders, officers, employees, mentors, and partners shall not be liable for any direct, indirect, incidental, consequential, special, exemplary, or punitive damages — including loss of profits, loss of capital, loss of data, or loss of goodwill — arising out of or in connection with your use of the Service.",
      "Our total aggregate liability for any claim arising from these terms or the Service is limited to the amount you actually paid to ea-central in the twelve (12) months preceding the claim, or ZAR 1, whichever is greater.",
    ],
  },
  {
    title: "11. Account suspension or termination",
    body: [
      "We may suspend or terminate your account at any time, without notice, if we suspect fraud, abuse, chargeback activity, sharing of credentials, or any breach of these terms.",
      "Termination does not entitle you to any refund of fees already paid.",
    ],
  },
  {
    title: "12. Changes to these terms",
    body: [
      "We may update these terms from time to time. Continued use of the Service after changes are posted constitutes acceptance of the new terms.",
    ],
  },
  {
    title: "13. Governing law",
    body: [
      "These terms are governed by the laws of the Republic of South Africa. Any dispute will be subject to the exclusive jurisdiction of the South African courts in the magisterial district of the ea-central operator.",
    ],
  },
  {
    title: "14. Contact",
    body: [
      "For payment confirmation, support, or any question about these terms, contact us on WhatsApp at the number displayed on the verification page.",
    ],
  },
];

export default function Terms() {
  return (
    <div className="min-h-screen bg-black text-white" data-testid="terms-page">
      <Header />
      <section className="max-w-3xl mx-auto px-4 sm:px-6 md:px-10 py-12 sm:py-20">
        <div className="ea-glass p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-[#1E90FF]/15 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full border border-[#1E90FF]/50 bg-[#1E90FF]/10 text-[#1E90FF]">
              <ShieldCheck className="w-7 h-7" strokeWidth={1.5} />
            </div>
            <div className="text-[10px] sm:text-xs tracking-[0.3em] uppercase text-[#1E90FF] mt-6 text-center">
              / legal · ea-central
            </div>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight mt-3 text-center">
              Terms & <span className="text-[#1E90FF]">Conditions</span>
            </h1>
            <p className="text-white/55 text-xs mt-2 text-center tracking-wider">
              Effective {new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })} · please read carefully before paying or trading.
            </p>

            {/* Quick-glance risk banner */}
            <div className="mt-8 border border-[#FF3B3B]/60 bg-[#FF3B3B]/[0.08] px-4 py-3 flex items-start gap-3" data-testid="terms-risk-banner">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-[#FF3B3B]" />
              <div className="text-sm text-white/90 leading-relaxed">
                <span className="font-extrabold text-[#FF3B3B]">High-risk warning:</span> forex trading carries a substantial
                risk of loss. ea-central does not give financial advice and is not responsible for any losses on your broker account.
                Payments are <span className="font-bold">strictly non-refundable</span>.
              </div>
            </div>

            <div className="mt-10 space-y-7" data-testid="terms-sections">
              {SECTIONS.map((s, i) => (
                <div key={i} className="space-y-2" data-testid={`terms-section-${i}`}>
                  <h2 className={`font-display text-lg sm:text-xl font-bold tracking-tight ${s.risk ? "text-[#FF3B3B]" : "text-[#1E90FF]"}`}>
                    {s.title}
                  </h2>
                  {s.body.map((p, j) => (
                    <p key={j} className="text-sm text-white/75 leading-relaxed">{p}</p>
                  ))}
                </div>
              ))}
            </div>

            <p className="text-[11px] tracking-[0.22em] uppercase text-white/35 text-center pt-10 border-t border-white/5 mt-10">
              By using ea-central you confirm you have read, understood, and accepted these terms.
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
