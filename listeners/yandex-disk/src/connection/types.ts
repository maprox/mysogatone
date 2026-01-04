/**
 * Типы для TCP соединений
 */

// Type aliases to avoid explicit Deno namespace references
// Используем Deno.connect с явным указанием TCP параметров для получения правильного типа
// Deno.connect может возвращать TcpConn или VsockConn, но мы используем только TCP
type ConnectTcp = (
  options: { hostname: string; port: number },
) => Promise<Deno.TcpConn>;

export type TcpConn = Awaited<ReturnType<ConnectTcp>>;
export type NetAddr = Deno.NetAddr;

