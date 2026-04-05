"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042"];

interface AdminData {
  totalUsers: number;
  activeUsers: number;
  totalCampaigns: number;
  totalInvites: number;
  totalConnections: number;
  totalResponses: number;
  contactsByStage: { stage: string; count: number }[];
  contactsByUser: { user: string; count: number }[];
  tokenUsage: { month: string; tokens: number }[];
  usageTime: { totalHours: number; avgPerUser: number };
  topUsersByTime: { user: string; hours: number }[];
}

export default function AdminPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("month");

  useEffect(() => {
    setLoading(true);
    if (session?.user?.email === "federico.ledesma@protofire.io") {
      fetch(`/api/admin/stats?period=${period}`)
        .then(r => r.json())
        .then(setData)
        .catch(() => alert("Error loading data"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [session, period]);

  if (!session) return <div>Loading session...</div>;
  if (session.user?.email !== "federico.ledesma@protofire.io") {
    return <div className="p-4 text-center">403 Forbidden - Access denied</div>;
  }

  if (loading) return <div className="p-4">Loading admin data...</div>;
  if (!data) return <div className="p-4">Error loading data</div>;

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="flex gap-4">
        <Select value={period} onValueChange={(value) => value && setPeriod(value)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Último Mes</SelectItem>
            <SelectItem value="quarter">Último Trimestre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader><CardTitle>Usuarios Totales</CardTitle></CardHeader>
          <CardContent>{data.totalUsers}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Usuarios Activos</CardTitle></CardHeader>
          <CardContent>{data.activeUsers}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Campañas Creadas</CardTitle></CardHeader>
          <CardContent>{data.totalCampaigns}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Invites Enviados</CardTitle></CardHeader>
          <CardContent>{data.totalInvites}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Conexiones Aceptadas</CardTitle></CardHeader>
          <CardContent>{data.totalConnections}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Respuestas Recibidas</CardTitle></CardHeader>
          <CardContent>{data.totalResponses}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Horas Totales de Uso</CardTitle></CardHeader>
          <CardContent>{data.usageTime.totalHours}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Promedio Horas por Usuario</CardTitle></CardHeader>
          <CardContent>{data.usageTime.avgPerUser}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Consumo de Tokens LLM</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.tokenUsage}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="tokens" stroke="#8884d8" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contactos por Etapa</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.contactsByStage}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#82ca9d" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Contactos por Usuario</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.contactsByUser} dataKey="count" nameKey="user" cx="50%" cy="50%" outerRadius={80} fill="#8884d8">
                  {data.contactsByUser.map((entry, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top Usuarios por Tiempo de Uso</CardTitle></CardHeader>
          <CardContent>
            <ul>
              {data.topUsersByTime.map((u, i: number) => (
                <li key={i}>{u.user}: {Math.round(u.hours)} horas</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}