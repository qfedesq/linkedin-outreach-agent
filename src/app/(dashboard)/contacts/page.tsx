"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Download, Trash2, ExternalLink } from "lucide-react";

interface Contact {
  id: string;
  name: string;
  position: string | null;
  company: string | null;
  linkedinUrl: string;
  profileFit: string;
  status: string;
  inviteSentDate: string | null;
  connectedDate: string | null;
  followupSentDate: string | null;
  notes: string | null;
  source: string | null;
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

const STATUS_COLORS: Record<string, string> = {
  TO_CONTACT: "bg-gray-100 text-gray-700",
  INVITED: "bg-blue-100 text-blue-700",
  CONNECTED: "bg-green-100 text-green-700",
  FOLLOWED_UP: "bg-yellow-100 text-yellow-700",
  REPLIED: "bg-purple-100 text-purple-700",
  MEETING_BOOKED: "bg-emerald-100 text-emerald-700",
  UNRESPONSIVE: "bg-red-100 text-red-700",
};

const FIT_COLORS: Record<string, string> = {
  HIGH: "bg-green-100 text-green-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-gray-100 text-gray-700",
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fitFilter, setFitFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/campaigns").then(r => r.json()).then(d => setCampaigns(d.campaigns || [])).catch(() => {});
  }, []);

  const fetchContacts = useCallback(async () => {
    const params = new URLSearchParams({ page: page.toString(), limit: "50" });
    if (search) params.set("search", search);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (fitFilter !== "all") params.set("fit", fitFilter);
    if (campaignFilter !== "all") params.set("campaignId", campaignFilter);

    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts);
    setTotal(data.total);
  }, [page, search, statusFilter, fitFilter, campaignFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

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
    const headers = ["Name", "Position", "Company", "LinkedIn URL", "Fit", "Status", "Invite Date", "Connected Date", "Follow-up Date", "Notes"];
    const rows = contacts.map((c) => [
      c.name, c.position || "", c.company || "", c.linkedinUrl,
      c.profileFit, STATUS_LABELS[c.status] || c.status,
      c.inviteSentDate || "", c.connectedDate || "", c.followupSentDate || "", c.notes || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground">{total} contacts total</p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, position..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { if (v) { setStatusFilter(v); setPage(1); } }}>
              <SelectTrigger className="w-40">
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
              <SelectTrigger className="w-32">
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
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="w-full overflow-hidden">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[15%]">Name</TableHead>
                  <TableHead className="w-[28%]">Position</TableHead>
                  <TableHead className="w-[12%]">Company</TableHead>
                  <TableHead className="w-[8%]">Fit</TableHead>
                  <TableHead className="w-[14%]">Status</TableHead>
                  <TableHead className="w-[8%]">Source</TableHead>
                  <TableHead className="w-[7%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium truncate">
                      <a
                        href={contact.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:underline min-w-0"
                      >
                        <span className="truncate">{contact.name}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </TableCell>
                    <TableCell className="text-sm truncate" title={contact.position || ""}>{contact.position}</TableCell>
                    <TableCell className="text-sm truncate" title={contact.company || ""}>{contact.company}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={FIT_COLORS[contact.profileFit]}>{contact.profileFit}</Badge>
                    </TableCell>
                    <TableCell>
                      <Select value={contact.status} onValueChange={(v) => { if (v) handleStatusChange(contact.id, v); }}>
                        <SelectTrigger className="h-7 text-xs">
                          <Badge variant="secondary" className={STATUS_COLORS[contact.status]}>
                            {STATUS_LABELS[contact.status]}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate">{contact.source}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(contact.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No contacts found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
