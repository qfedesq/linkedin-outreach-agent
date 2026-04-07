"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Download, Trash2, ExternalLink, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  position: string | null;
  company: string | null;
  linkedinUrl: string;
  profileFit: string;
  userId: string;
  user?: { name: string | null; email: string };
  status: string;
  inviteSentDate: string | null;
  connectedDate: string | null;
  followupSentDate: string | null;
  notes: string | null;
  source: string | null;
  campaignId: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  TO_CONTACT: "To Contact",
  INVITED: "Invited",
  CONNECTED: "Connected",
  FOLLOWED_UP: "Followed Up",
  REPLIED: "Replied",
  MEETING_BOOKED: "Meeting Booked",
  UNRESPONSIVE: "Unresponsive",
};

type SortField = "name" | "position" | "company" | "profileFit" | "status" | "campaign" | "owner" | "source";
type SortDir = "asc" | "desc";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fitFilter, setFitFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [owners, setOwners] = useState<Array<{ id: string; name: string | null; email: string | null }>>([]);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.campaigns || [])).catch(() => {});
  }, []);

  const campaignMap = Object.fromEntries(campaigns.map(c => [c.id, c.name]));

  const fetchContacts = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: "50", global: "true" });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (fitFilter !== "all") params.set("fit", fitFilter);
    if (campaignFilter !== "all") params.set("campaignId", campaignFilter);
    if (ownerFilter !== "all") params.set("userId", ownerFilter);

    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts);
    setTotal(data.total);
    // allOwners comes from API — covers all pages, not just current
    if (data.allOwners?.length > 0) setOwners(data.allOwners);
  }, [page, search, statusFilter, fitFilter, campaignFilter, ownerFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    toast.success("Contact deleted");
    fetchContacts();
  };

  const handleStatusChange = async (id: string, status: string) => {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchContacts();
  };

  const exportCSV = () => {
    const headers = ["Name", "Position", "Company", "LinkedIn URL", "Fit", "Status", "Campaign", "Source", "Invite Date", "Connected Date"];
    const rows = contacts.map((c) => [
      c.name, c.position || "", c.company || "", c.linkedinUrl,
      c.profileFit, STATUS_LABELS[c.status] || c.status,
      c.campaignId ? (campaignMap[c.campaignId] || c.campaignId) : "",
      c.source || "", c.inviteSentDate || "", c.connectedDate || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
  };

  // Client-side sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = [...contacts].sort((a, b) => {
    let va = "";
    let vb = "";
    switch (sortField) {
      case "name": va = a.name; vb = b.name; break;
      case "position": va = a.position || ""; vb = b.position || ""; break;
      case "company": va = a.company || ""; vb = b.company || ""; break;
      case "profileFit": {
        const fitOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return sortDir === "asc"
          ? (fitOrder[a.profileFit] ?? 3) - (fitOrder[b.profileFit] ?? 3)
          : (fitOrder[b.profileFit] ?? 3) - (fitOrder[a.profileFit] ?? 3);
      }
      case "status": {
        const statusOrder = Object.keys(STATUS_LABELS);
        return sortDir === "asc"
          ? statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
          : statusOrder.indexOf(b.status) - statusOrder.indexOf(a.status);
      }
      case "campaign":
        va = a.campaignId ? (campaignMap[a.campaignId] || "") : "";
        vb = b.campaignId ? (campaignMap[b.campaignId] || "") : "";
        break;
      case "owner":
        va = a.user?.name || a.user?.email || "";
        vb = b.user?.name || b.user?.email || "";
        break;
      case "source": va = a.source || ""; vb = b.source || ""; break;
    }
    const cmp = va.localeCompare(vb, undefined, { sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">{total} total</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm">
          <Download className="mr-2 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search name, company, position..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { if (v) { setStatusFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fitFilter} onValueChange={(v) => { if (v) { setFitFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-28 h-9 text-sm">
                <SelectValue placeholder="Fit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All fits</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={campaignFilter} onValueChange={(v) => { if (v) { setCampaignFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={(v) => { if (v) { setOwnerFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map(o => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name?.split(" ")[0] || o.email?.split("@")[0] || o.id.slice(-6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-hidden">
            <table className="table-fixed w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortHeader field="name" label="Name" current={sortField} dir={sortDir} onSort={toggleSort} width="13%" />
                  <SortHeader field="position" label="Position" current={sortField} dir={sortDir} onSort={toggleSort} width="19%" />
                  <SortHeader field="company" label="Company" current={sortField} dir={sortDir} onSort={toggleSort} width="10%" />
                  <SortHeader field="profileFit" label="Fit" current={sortField} dir={sortDir} onSort={toggleSort} width="6%" />
                  <SortHeader field="status" label="Status" current={sortField} dir={sortDir} onSort={toggleSort} width="12%" />
                  <SortHeader field="campaign" label="Campaign" current={sortField} dir={sortDir} onSort={toggleSort} width="12%" />
                  <SortHeader field="owner" label="Owner" current={sortField} dir={sortDir} onSort={toggleSort} width="10%" />
                  <SortHeader field="source" label="Source" current={sortField} dir={sortDir} onSort={toggleSort} width="7%" />
                  <th className="text-xs font-medium text-muted-foreground px-3 py-2.5 text-left" style={{ width: "6%" }}>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-2 truncate">
                      <a
                        href={c.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline text-foreground font-medium min-w-0"
                      >
                        <span className="truncate">{c.name}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate" title={c.position || ""}>{c.position || "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate" title={c.company || ""}>{c.company || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs font-medium ${c.profileFit === "HIGH" ? "text-green-600 dark:text-green-400" : c.profileFit === "MEDIUM" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                        {c.profileFit || "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Select value={c.status} onValueChange={(v) => { if (v) handleStatusChange(c.id, v); }}>
                        <SelectTrigger className="h-7 text-xs border-0 bg-transparent hover:bg-muted/50 px-1 -ml-1">
                          <span className="text-xs text-foreground">{STATUS_LABELS[c.status] || c.status}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate" title={c.campaignId ? (campaignMap[c.campaignId] || c.campaignId) : ""}>
                      {c.campaignId ? (campaignMap[c.campaignId] || "-") : "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate" title={c.user?.email || ""}>
                      {c.user?.name?.split(" ")[0] || c.user?.email?.split("@")[0] || "-"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground truncate">{c.source || "-"}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center text-muted-foreground py-12 text-sm">
                      No contacts found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function SortHeader({ field, label, current, dir, onSort, width }: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  width: string;
}) {
  const active = current === field;
  return (
    <th
      className="text-xs font-medium text-muted-foreground px-3 py-2.5 text-left cursor-pointer select-none hover:text-foreground transition-colors"
      style={{ width }}
      onClick={() => onSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}
