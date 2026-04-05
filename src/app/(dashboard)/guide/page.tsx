"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings, MessageSquare, Users, Search, Send, TrendingUp,
  CheckCircle, ChevronDown, ChevronRight, Zap, Shield, Brain,
  Target, Megaphone, BarChart3, Clock, ArrowRight,
} from "lucide-react";

interface StepProps {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Step({ number, title, description, icon, children, defaultOpen = false }: StepProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="border-border/50 transition-all duration-200 hover:border-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left"
      >
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
              {number}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm flex items-center gap-2">
                {icon}
                {title}
                <span className="ml-auto text-muted-foreground">
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 pl-14 pr-6 pb-4">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 bg-primary/5 border border-primary/10 rounded-lg p-3 mt-3">
      <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-foreground/80">{children}</p>
    </div>
  );
}

function ChatExample({ prompt }: { prompt: string }) {
  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 mt-2 font-mono text-xs text-foreground/70">
      <ArrowRight className="w-3 h-3 text-primary shrink-0" />
      <span>&ldquo;{prompt}&rdquo;</span>
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">How to Use</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Step-by-step guide from first login to running autonomous outreach campaigns.
        </p>
      </div>

      {/* Quick Overview */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start gap-3">
            <Brain className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground">This is a conversational AI agent</p>
              <p className="text-xs text-muted-foreground mt-1">
                The chat is your main interface. Tell the agent what you want in natural language and it
                will discover prospects, score them, write personalized messages, send invites, and follow up &mdash;
                all while learning from your feedback to improve over time.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-3">

        <Step
          number={1}
          title="Configure your API keys"
          description="Connect the services the agent needs to operate."
          icon={<Settings className="w-4 h-4 text-muted-foreground" />}
          defaultOpen={true}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>Go to <strong>Settings</strong> (bottom left) and configure:</p>
            <ol className="list-decimal list-inside space-y-2 ml-1">
              <li>
                <strong>LinkedIn Connection (Unipile)</strong> &mdash; Your Unipile API key, DSN server URL,
                and Account ID. This gives the agent a persistent LinkedIn session.
                Click <em>Test Connection</em> to verify.
              </li>
              <li>
                <strong>OpenRouter</strong> &mdash; Your OpenRouter API key for the LLM that writes
                personalized messages and scores prospects. Make sure it has credits.
                Select your preferred model (Claude Sonnet recommended).
              </li>
              <li>
                <strong>Agent Autonomy Level</strong> &mdash; Start with <em>Training</em> (asks before sending).
                Move to <em>Semi-auto</em> or <em>Full auto</em> as you gain confidence.
              </li>
            </ol>
            <Tip>
              Use the eye icon to reveal/hide API keys. Click &ldquo;Test Connection&rdquo; for each service
              before saving to make sure everything works.
            </Tip>
          </div>
        </Step>

        <Step
          number={2}
          title="Create your first campaign"
          description="Campaigns organize your outreach by target audience."
          icon={<Megaphone className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>Click the <strong>+</strong> next to &ldquo;Campaigns&rdquo; in the sidebar, or tell the agent:</p>
            <ChatExample prompt="Create a campaign called Enterprise Sales targeting VP Engineering at fintech companies" />
            <p className="mt-3">Then configure the campaign (click the gear icon next to it):</p>
            <ul className="list-disc list-inside space-y-1.5 ml-1">
              <li><strong>ICP Definition</strong> &mdash; Describe your ideal customer. This is critical for scoring.</li>
              <li><strong>Strategy Notes</strong> &mdash; Tone, messaging approach, value proposition.</li>
              <li><strong>Calendar URL</strong> &mdash; Your booking link for meeting requests.</li>
              <li><strong>Daily invite limit</strong> &mdash; Max invites per day for this campaign.</li>
            </ul>
            <Tip>
              The ICP definition is the most important field. Be specific: job titles, company size,
              industry, geography, pain points. The better the ICP, the better the scoring and messaging.
            </Tip>
          </div>
        </Step>

        <Step
          number={3}
          title="Discover prospects"
          description="Search LinkedIn for people matching your ICP."
          icon={<Search className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>Open the campaign chat (click the campaign name in the sidebar) and tell the agent:</p>
            <ChatExample prompt="Search LinkedIn for VP Engineering in United Kingdom" />
            <ChatExample prompt="Find CTOs at fintech companies in New York" />
            <p className="mt-2">
              The agent searches LinkedIn via Unipile, saves new contacts to your campaign, detects
              connection degree (1st/2nd/3rd), and skips duplicates automatically.
            </p>
            <Tip>
              1st-degree connections are auto-marked as CONNECTED &mdash; you can send them messages
              directly without an invite. Run multiple searches with different keywords to build a diverse pipeline.
            </Tip>
          </div>
        </Step>

        <Step
          number={4}
          title="Score your contacts"
          description="Let the AI evaluate fit based on your ICP."
          icon={<Target className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>After discovering prospects, score them:</p>
            <ChatExample prompt="Score the new contacts" />
            <p className="mt-2">
              The LLM evaluates each contact against your campaign&apos;s ICP definition and assigns
              <Badge variant="outline" className="mx-1 text-[9px] px-1.5">HIGH</Badge>
              <Badge variant="outline" className="mx-1 text-[9px] px-1.5">MEDIUM</Badge> or
              <Badge variant="outline" className="mx-1 text-[9px] px-1.5">LOW</Badge> fit
              with a rationale.
            </p>
            <Tip>
              HIGH-fit contacts are prioritized for invites. You can view all contacts and their scores
              in the Contacts tab.
            </Tip>
          </div>
        </Step>

        <Step
          number={5}
          title="Prepare and send invites"
          description="The agent writes personalized connection notes."
          icon={<Send className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>Two-step process for safety:</p>
            <div className="space-y-2 mt-2">
              <div className="flex items-start gap-2">
                <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0">A</span>
                <div>
                  <p className="font-medium">Prepare drafts</p>
                  <ChatExample prompt="Prepare invites for 10 contacts" />
                  <p className="mt-1 text-muted-foreground">
                    The LLM writes personalized connection notes. You can review and edit them.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-primary/10 text-primary rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shrink-0">B</span>
                <div>
                  <p className="font-medium">Send approved invites</p>
                  <ChatExample prompt="Send them" />
                  <p className="mt-1 text-muted-foreground">
                    Invites are sent one by one with human-like delays (45s between each).
                    Rate limits are auto-enforced: 15/day, 60/week.
                  </p>
                </div>
              </div>
            </div>
            <Tip>
              In Training mode, the agent always shows you drafts before sending. In Full Auto mode,
              it prepares and sends without asking. Start with Training to build confidence.
            </Tip>
          </div>
        </Step>

        <Step
          number={6}
          title="Monitor connections and follow up"
          description="Track who accepted and send follow-up messages."
          icon={<Users className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>The agent can check for new connections and send follow-ups:</p>
            <ChatExample prompt="Check for new connections and follow up" />
            <ChatExample prompt="Run the full daily cycle" />
            <p className="mt-2">This will:</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Detect which invites were accepted (new connections)</li>
              <li>Scan inbox for replies from prospects</li>
              <li>Send follow-up messages to connections older than 3 days</li>
            </ul>
            <Tip>
              Follow-up delay is configurable per campaign (default: 3 days).
              The agent generates unique follow-up messages using your campaign strategy.
            </Tip>
          </div>
        </Step>

        <Step
          number={7}
          title="Track performance"
          description="Monitor acceptance rates, replies, and meetings."
          icon={<BarChart3 className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>Check how your campaigns are performing:</p>
            <ChatExample prompt="How are my campaigns doing?" />
            <ChatExample prompt="Show me pipeline stats" />
            <p className="mt-2">Or visit the <strong>Analytics</strong> tab for a visual overview of:</p>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li>Acceptance rate (invites to connections)</li>
              <li>Reply rate (connections to conversations)</li>
              <li>Meeting conversion</li>
              <li>Best performing messages</li>
            </ul>
          </div>
        </Step>

        <Step
          number={8}
          title="Teach the agent"
          description="The agent learns from your corrections and improves."
          icon={<Brain className="w-4 h-4 text-muted-foreground" />}
        >
          <div className="space-y-3 text-xs text-foreground/80">
            <p>Give the agent feedback and it will remember across sessions:</p>
            <ChatExample prompt="Remember that we should use a casual, founder-to-founder tone" />
            <ChatExample prompt="Never mention pricing in the first message" />
            <ChatExample prompt="Our best hook is asking about their scaling challenges" />
            <p className="mt-2">
              The agent stores these as knowledge entries (visible in Settings &gt; Knowledge Base)
              and uses them to improve future messages, scoring, and strategy.
            </p>
            <Tip>
              The more you teach, the better it gets. Correct bad messages, share what works,
              and define messaging rules. Over time, upgrade autonomy from Training to Full Auto.
            </Tip>
          </div>
        </Step>
      </div>

      {/* Pro Tips Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Pro Tips for Best Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <ProTip
              icon={<Shield className="w-3.5 h-3.5" />}
              title="Respect LinkedIn limits"
            >
              The agent auto-enforces 15 invites/day and 60/week. Don&apos;t try to override this &mdash;
              LinkedIn can restrict your account. The sidebar shows your daily usage.
            </ProTip>

            <ProTip
              icon={<Target className="w-3.5 h-3.5" />}
              title="Write detailed ICPs"
            >
              Instead of &ldquo;fintech executives&rdquo;, write: &ldquo;VP+ at Series B-D fintech companies
              (100-500 employees) focused on lending, payments, or DeFi infrastructure.
              Based in US/UK. Decision-makers for blockchain/infrastructure partnerships.&rdquo;
            </ProTip>

            <ProTip
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              title="Review messages in Training mode first"
            >
              Spend a week in Training mode reviewing and editing drafts. Give corrections.
              The agent learns your style. Then switch to Semi or Full Auto.
            </ProTip>

            <ProTip
              icon={<Clock className="w-3.5 h-3.5" />}
              title="Run daily cycles consistently"
            >
              Tell the agent &ldquo;run the full daily cycle&rdquo; every day or set up Semi-auto.
              Consistency matters more than volume for LinkedIn outreach.
            </ProTip>

            <ProTip
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              title="Use the health check"
            >
              Before a big outreach day, ask the agent: &ldquo;check system health&rdquo;. It verifies
              all API keys, LinkedIn connection, rate limits, and campaign config.
            </ProTip>

            <ProTip
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              title="Iterate on strategy"
            >
              Check Analytics weekly. If acceptance is low, update your campaign strategy notes and
              ICP. Tell the agent what&apos;s working and what isn&apos;t &mdash; it adapts.
            </ProTip>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProTip({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{children}</p>
      </div>
    </div>
  );
}
