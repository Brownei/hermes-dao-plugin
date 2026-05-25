import { React, useState, useEffect, useCallback, useRef } from "react";
import { MsgSend } from "cosmes/client";
import {
  CompassController,
  ConnectedWallet,
  CosmostationController,
  KeplrController,
  LeapController,
  MetamaskInjectiveController,
  NinjiController,
  OWalletController,
  StationController,
  UnsignedTx,
  WalletController,
  WalletName,
  WalletType,
} from "cosmes/wallet";

declare global {
  interface Window {
    __HERMES_PLUGIN_SDK__: {
      React: typeof React;
      components: {
        Card: any; CardContent: any; CardHeader: any; CardTitle: any;
        Badge: any; Button: any; Input: any; Label: any; Select: any; SelectOption: any;
      };
      hooks: {
        useState: typeof React.useState;
        useEffect: typeof React.useEffect;
        useCallback: typeof React.useCallback;
        useMemo: typeof React.useMemo;
        useRef: typeof React.useRef;
      };
      utils: { cn: any; timeAgo: any };
      useI18n: any;
    };
    __HERMES_PLUGINS__: {
      register: (name: string, component: any) => void;
    };
  }
}

const SDK = typeof window !== "undefined" ? window.__HERMES_PLUGIN_SDK__ : null;
if (!SDK) {
  console.warn("Hermes Plugin SDK not available");
}

const h = SDK ? SDK.React.createElement : (() => null) as any;

const {
  Card, CardContent, CardHeader, CardTitle,
  Badge, Button, Input, Label, Select, SelectOption,
} = SDK ? SDK.components : {};
const { useState, useEffect, useCallback, useMemo, useRef } = SDK ? SDK.hooks : {};
const { cn, timeAgo } = SDK ? SDK.utils : {};

const useI18n = SDK?.useI18n || function() { return { t: { terpKanban: null }, locale: "en" }; };

function tx(t: any, path: string, fallback: string, vars?: Record<string, string>) {
  let node = t && t.terpKanban;
  if (node) {
    const parts = path.split(".");
    for (let i = 0; i < parts.length; i++) {
      if (node && typeof node === "object" && parts[i] in node) {
        node = node[parts[i]];
      } else { node = null; break; }
    }
  }
  let str = (typeof node === "string") ? node : fallback;
  if (vars) {
    for (const k in vars) {
      str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
    }
  }
  return str;
}

// Cosmes wallet connection - proper implementation
const WC_PROJECT_ID = "2b7d5a2da89dd74fed821d184acabf95";
const SIGN_ARBITRARY_MSG = "Hi from Terp Kanban! This is a test message to prove the wallet is working.";
const TX_MEMO = "signed via cosmes";

const CONTROLLERS: Record<string, WalletController> = {
  [WalletName.STATION]: new StationController(),
  [WalletName.KEPLR]: new KeplrController(WC_PROJECT_ID),
  [WalletName.LEAP]: new LeapController(WC_PROJECT_ID),
  [WalletName.COMPASS]: new CompassController(),
  [WalletName.COSMOSTATION]: new CosmostationController(WC_PROJECT_ID),
  [WalletName.METAMASK_INJECTIVE]: new MetamaskInjectiveController(),
  [WalletName.NINJI]: new NinjiController(),
  [WalletName.OWALLET]: new OWalletController(),
};

const WALLETS: Record<WalletName, string> = {
  [WalletName.KEPLR]: "Keplr",
  [WalletName.COSMOSTATION]: "Cosmostation",
  [WalletName.STATION]: "Station",
  [WalletName.LEAP]: "Leap",
  [WalletName.COMPASS]: "Compass",
  [WalletName.METAMASK_INJECTIVE]: "MetaMask",
  [WalletName.NINJI]: "Ninji",
  [WalletName.OWALLET]: "OWallet",
};

const TYPES: Record<WalletType, string> = {
  [WalletType.EXTENSION]: "Extension",
  [WalletType.WALLETCONNECT]: "Wallet Connect",
};

const CHAINS: Record<string, string> = {
  "osmosis-1": "Osmosis",
  "juno-1": "Juno",
  "kaiyo-1": "Kujira",
  "phoenix-1": "Terra",
  "columbus-5": "Terra Classic",
  "neutron-1": "Neutron",
  "migaloo-1": "Migaloo",
  "injective-1": "Injective",
  "pacific-1": "Sei",
  "dymension_1100-1": "Dymension",
  "terp-1": "Terp Network",
  Oraichain: "Oraichain",
};

function getRpc(chain: string): string {
  switch (chain) {
    case "osmosis-1": return "https://rpc.osmosis.zone";
    case "juno-1": return "https://juno-rpc.polkachu.com";
    case "kaiyo-1": return "https://kujira-rpc.polkachu.com";
    case "phoenix-1": return "https://terra-rpc.publicnode.com";
    case "columbus-5": return "https://terra-classic-rpc.publicnode.com";
    case "neutron-1": return "https://neutron-rpc.polkachu.com";
    case "migaloo-1": return "https://migaloo-rpc.polkachu.com";
    case "injective-1": return "https://injective-rpc.polkachu.com";
    case "pacific-1": return "https://rpc-sei-ia.cosmosia.notional.ventures";
    case "dymension_1100-1": return "https://rpc.dymension.nodestake.org";
    case "terp-1": return "https://rpc.terp.network";
    case "Oraichain": return "https://rpc.orai.io";
    default: throw new Error("Unknown chain: " + chain);
  }
}

function getGasPrice(chain: string): { amount: string; denom: string } {
  switch (chain) {
    case "osmosis-1": return { amount: "0.0025", denom: getDenom(chain) };
    case "juno-1": return { amount: "0.001", denom: getDenom(chain) };
    case "kaiyo-1": return { amount: "0.00119", denom: getDenom(chain) };
    case "phoenix-1": return { amount: "0.015", denom: getDenom(chain) };
    case "columbus-5": return { amount: "28.325", denom: getDenom(chain) };
    case "neutron-1": return { amount: "0.01", denom: getDenom(chain) };
    case "migaloo-1": return { amount: "1", denom: getDenom(chain) };
    case "injective-1": return { amount: "500000000", denom: getDenom(chain) };
    case "pacific-1": return { amount: "0.1", denom: getDenom(chain) };
    case "dymension_1100-1": return { amount: "20000000000", denom: getDenom(chain) };
    case "terp-1": return { amount: "0.001", denom: getDenom(chain) };
    case "Oraichain": return { amount: "0.003", denom: getDenom(chain) };
    default: throw new Error("Unknown chain: " + chain);
  }
}

function getDenom(chain: string): string {
  switch (chain) {
    case "osmosis-1": return "uosmo";
    case "juno-1": return "ujuno";
    case "kaiyo-1": return "ukuji";
    case "phoenix-1":
    case "columbus-5": return "uluna";
    case "neutron-1": return "untrn";
    case "migaloo-1": return "uwhale";
    case "injective-1": return "inj";
    case "pacific-1": return "usei";
    case "dymension_1100-1": return "adym";
    case "terp-1": return "uterp";
    case "Oraichain": return "orai";
    default: throw new Error("Unknown chain: " + chain);
  }
}

// Wallet state
let _currentWallet: ConnectedWallet | null = null;
let _currentChainId: string | null = null;
let _walletController: WalletController | null = null;
let _selectedWalletName: WalletName = WalletName.KEPLR;
let _selectedWalletType: WalletType = WalletType.EXTENSION;

const eventHandlersRegistered: Record<string, boolean> = {};

function initializeWalletEvents(onWalletChange: (wallet: ConnectedWallet | null) => void) {
  Object.entries(CONTROLLERS).forEach(([walletName, controller]) => {
    if (eventHandlersRegistered[walletName]) return;

    controller.onDisconnect((disconnectedWallets) => {
      const chains = disconnectedWallets.map((w) => w.chainId);
      console.log("Wallet disconnected", { wallet: controller.id, chains });
      if (_currentWallet && chains.includes(_currentWallet.chainId)) {
        _currentWallet = null;
        _currentChainId = null;
        _walletController = null;
        onWalletChange(null);
      }
    });

    controller.onAccountChange((changedWallets) => {
      const chains = changedWallets.map((w) => w.chainId);
      console.log("Wallet account changed", { wallet: controller.id, chains });
      if (_currentChainId && chains.includes(_currentChainId)) {
        connectWallet(_currentChainId, onWalletChange).catch(console.error);
      }
    });

    eventHandlersRegistered[walletName] = true;
  });
}

async function connectWallet(chainId: string, onWalletChange: (wallet: ConnectedWallet | null) => void): Promise<ConnectedWallet | null> {
  try {
    if (!_walletController) {
      _walletController = CONTROLLERS[_selectedWalletName];
    }

    const chainInfos = [{
      chainId,
      rpc: getRpc(chainId),
      gasPrice: getGasPrice(chainId),
    }];

    const wallets = await _walletController.connect(_selectedWalletType, chainInfos);
    const wallet = wallets.get(chainId);
    if (!wallet) {
      throw new Error("No wallet found for chain: " + chainId);
    }

    _currentWallet = wallet;
    _currentChainId = chainId;
    onWalletChange(wallet);

    console.log("Wallet connected:", {
      address: wallet.address,
      chainId: wallet.chainId,
      wallet: wallet.id,
    });

    return wallet;
  } catch (err: any) {
    console.error("Wallet connection failed:", err?.message);
    throw new Error(`Failed to connect wallet: ${err?.message || "Unknown error"}`);
  }
}

async function disconnectWallet(onWalletChange: (wallet: ConnectedWallet | null) => void): Promise<void> {
  // Call logout API to clear session
  try {
    await fetchApi("/wallet/logout", { method: "POST" });
  } catch (err) {
    console.error("Logout API error:", err);
  }

  if (_walletController && _currentChainId) {
    try {
      await _walletController.disconnect([_currentChainId]);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  }
  _currentWallet = null;
  _currentChainId = null;
  _walletController = null;
  onWalletChange(null);
}

function getConnectedWallet(): ConnectedWallet | null {
  return _currentWallet;
}

function getWalletAddress(): string | null {
  return _currentWallet?.address || null;
}

function setSelectedWallet(walletName: WalletName, walletType: WalletType) {
  _selectedWalletName = walletName;
  _selectedWalletType = walletType;
  _walletController = null;
}

const API_BASE = "/api/plugins/terp-kanban";

let _walletSessionToken: string | null = null;

export function setWalletSessionToken(token: string | null) {
  _walletSessionToken = token;
}

async function fetchApi(endpoint: string, options: RequestInit = {}) {
  const url = API_BASE + endpoint;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (_walletSessionToken) {
    headers["x-wallet-session"] = _walletSessionToken;
  }
  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

const api = {
  board: {
    get: (slug?: string) => {
      const params = slug ? `?board=${slug}` : "";
      return fetchApi(`/board${params}`);
    },
    list: () => fetchApi("/wallet/boards"),
    create: (data: any) => fetchApi("/wallet/boards", { method: "POST", body: JSON.stringify(data) }),
    update: (slug: string, data: any) => fetchApi(`/wallet/boards/${slug}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (slug: string) => fetchApi(`/wallet/boards/${slug}`, { method: "DELETE" }),
  },
  task: {
    get: (taskId: string) => fetchApi(`/tasks/${taskId}`),
    create: (data: any) => fetchApi("/tasks", { method: "POST", body: JSON.stringify(data) }),
    update: (taskId: string, data: any) => fetchApi(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
    bulk: (data: any) => fetchApi("/tasks/bulk", { method: "POST", body: JSON.stringify(data) }),
    delete: (taskId: string) => fetchApi(`/tasks/${taskId}`, { method: "DELETE" }),
  },
  member: {
    list: (boardSlug: string) => fetchApi(`/wallet/boards/${boardSlug}/members`),
    add: (boardSlug: string, data: any) => fetchApi(`/wallet/boards/${boardSlug}/members`, { method: "POST", body: JSON.stringify(data) }),
    remove: (boardSlug: string, walletAddr: string) => fetchApi(`/wallet/boards/${boardSlug}/members/${walletAddr}`, { method: "DELETE" }),
  },
};

const COLUMN_ORDER = ["triage", "todo", "ready", "running", "blocked", "done"];

const FALLBACK_COLUMN_LABEL: Record<string, string> = {
  triage: "Triage",
  todo: "Todo",
  ready: "Ready",
  running: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

function getColumnLabel(t: any, status: string) {
  return tx(t, "columnLabels." + status, FALLBACK_COLUMN_LABEL[status] || status);
}

function attachTouchDrag(el: HTMLElement | null, taskId: string) {
  if (!el) return;
  let startX = 0, startY = 0, proxy: HTMLElement | null = null;
  const onPointerDown = function(e: PointerEvent) {
    if ((e.target as HTMLElement).closest(".hermes-kanban-card-actions")) return;
    startX = e.clientX; startY = e.clientY;
    el.setPointerCapture(e.pointerId);
    proxy = document.createElement("div");
    proxy.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;opacity:0;";
    document.body.appendChild(proxy);
  };
  const onPointerMove = function(e: PointerEvent) {
    if (!proxy) return;
    const dx = Math.abs(e.clientX - startX), dy = Math.abs(e.clientY - startY);
    if (dx > 10 || dy > 10) {
      const ev = new CustomEvent("hermes-kanban-touch-drag", { bubbles: true, detail: { taskId } });
      el.dispatchEvent(ev);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      if (proxy) proxy.remove();
      proxy = null;
    }
  };
  const onPointerUp = function() {
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    if (proxy) proxy.remove();
    proxy = null;
  };
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
}

interface TaskCardProps {
  task: any;
  columnId: string;
  onDragStart?: (taskId: string) => void;
  onDragEnd?: () => void;
  draggingTaskId: string | null;
  isDragSource: boolean;
}

function TaskCard({ task, columnId, onDragStart, onDragEnd, draggingTaskId, isDragSource }: TaskCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (cardRef.current) {
      return attachTouchDrag(cardRef.current, task.id);
    }
  }, [task.id]);

  const handleDragStart = function(e: DragEvent) {
    e.dataTransfer!.effectAllowed = "move";
    e.dataTransfer!.setData("text/plain", JSON.stringify({ taskId: task.id, sourceColumnId: columnId }));
    const ghost = document.createElement("div");
    ghost.className = "hermes-kanban-drag-ghost";
    ghost.textContent = task.title;
    document.body.appendChild(ghost);
    e.dataTransfer!.setDragImage(ghost, 0, 0);
    setTimeout(() => ghost.remove(), 0);
    if (onDragStart) onDragStart(task.id);
  };

  const handleDragEnd = function() {
    if (onDragEnd) onDragEnd();
  };

  const cnFunc = cn || ((...classes: string[]) => classes.filter(Boolean).join(" "));

  return h("div", {
    ref: cardRef,
    className: cnFunc("hermes-kanban-card", isDragSource ? "hermes-kanban-card--dragging-source" : ""),
    draggable: true,
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
  },
    h("div", { className: "hermes-kanban-card-content" },
      h("div", { className: "hermes-kanban-card-title" }, task.title),
      task.body && h("div", { className: "hermes-kanban-card-body" }, task.body.slice(0, 100)),
      task.assignee && h(Badge, { variant: "secondary", className: "hermes-kanban-card-assignee" }, task.assignee.slice(0, 8))
    )
  );
}

interface KanbanColumnProps {
  column: any;
  tasks: any[];
  columnId: string;
  onDragOver?: (e: DragEvent, columnId: string) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent, columnId: string) => void;
  draggingTaskId: string | null;
  selectedIds: Set<string>;
}

function KanbanColumn({ column, tasks, columnId, onDragOver, onDragLeave, onDrop, draggingTaskId, selectedIds }: KanbanColumnProps) {
  const { t, locale } = useI18n();
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = function(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
    if (!dragOver) setDragOver(true);
  };

  const handleDragLeave = function(e: DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleDrop = function(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (onDrop) onDrop(e, columnId);
  };

  const columnTasks = tasks.filter(t => t.column_id === columnId);
  const cnFunc = cn || ((...classes: string[]) => classes.filter(Boolean).join(" "));

  return h("div", {
    className: cnFunc("hermes-kanban-column", dragOver ? "hermes-kanban-column--drop" : ""),
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  },
    h("div", { className: "hermes-kanban-column-header" },
      h("span", { className: "hermes-kanban-column-title" }, getColumnLabel(t, column?.title || columnId)),
      h(Badge, { variant: "outline" }, columnTasks.length)
    ),
    h("div", { className: "hermes-kanban-column-tasks" },
      columnTasks.map(tk =>
        h(TaskCard, {
          key: tk.id,
          task: tk,
          columnId: columnId,
          draggingTaskId: draggingTaskId,
          onDragStart: null,
          onDragEnd: null,
          isDragSource: draggingTaskId && selectedIds.has(draggingTaskId) && selectedIds.has(tk.id),
        })
      )
    )
  );
}

interface BoardViewProps {
  boardData: any;
  user: any;
  onCreateTask: (boardSlug: string) => void;
  onUpdateTask: (taskId: string, data: any) => void;
  onMoveTask: (data: { taskIds: string[]; column_id: string }) => void;
  onOpenShare: () => void;
  onOpenMembers: () => void;
}

function BoardView({ boardData, user, onCreateTask, onUpdateTask, onMoveTask, onOpenShare, onOpenMembers }: BoardViewProps) {
  const { t, locale } = useI18n();
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [selectedIds] = useState(new Set<string>());

  const handleDragStart = useCallback(function(taskId: string) { setDraggingTaskId(taskId); }, []);
  const handleDragEnd = useCallback(function() { setDraggingTaskId(null); }, []);

  const handleDrop = useCallback(function(e: DragEvent, targetColumnId: string) {
    try {
      const data = JSON.parse(e.dataTransfer!.getData("text/plain"));
      const { taskId, sourceColumnId } = data;
      if (targetColumnId !== sourceColumnId) {
        onMoveTask({ taskIds: [taskId], column_id: targetColumnId });
      }
    } catch (err) { }
  }, [onMoveTask]);

  if (!boardData) {
    return h("div", { className: "hermes-kanban-empty" }, "Loading board...");
  }

  const { board, columns, tasks } = boardData;
  const isAdmin = user?.role === "admin";
  const isEditor = user?.role === "admin" || user?.role === "editor";

  return h("div", { className: "hermes-kanban-board" },
    h("div", { className: "hermes-kanban-board-header" },
      h("div", { className: "board-header-left" },
        h("h2", null, board.name)
      ),
      h("div", { className: "board-header-right" },
        isEditor && h(Button, { onClick: onOpenShare, variant: "outline", size: "sm" }, "Share"),
        isAdmin && h(Button, { onClick: onOpenMembers, variant: "outline", size: "sm" }, "Members"),
        isAdmin && h(Button, { onClick: () => onCreateTask(board.slug), size: "sm" }, "Add Task")
      )
    ),
    h("div", { className: "hermes-kanban-columns" },
      (columns || COLUMN_ORDER.map(id => ({ id, title: id }))).map((col: any) =>
        h(KanbanColumn, {
          key: col.id,
          column: col,
          columnId: col.id,
          tasks: tasks || [],
          draggingTaskId: draggingTaskId,
          onDragStart: handleDragStart,
          onDragEnd: handleDragEnd,
          onDrop: handleDrop,
          selectedIds: selectedIds,
        })
      )
    )
  );
}

interface BoardListProps {
  boards: any[];
  onSelect: (slug: string) => void;
  onDelete: (slug: string) => void;
  user: any;
}

function BoardList({ boards, onSelect, onDelete, user }: BoardListProps) {
  const { t, locale } = useI18n();

  return h("div", { className: "hermes-kanban-board-list" },
    h("h2", null, "Your Boards"),
    boards.length === 0
      ? h("p", { className: "hermes-kanban-empty" }, "No boards yet. Create one to get started.")
      : h("div", { className: "hermes-kanban-board-grid" },
        boards.map(board =>
          h(Card, { key: board.slug, className: "hermes-kanban-board-card", onClick: () => onSelect(board.slug) },
            h(CardHeader, null,
              h(CardTitle, null, board.name)
            ),
            h(CardContent, null,
              h("p", null, board.description || "No description"),
              h("small", null, `Created: ${new Date(board.created_at).toLocaleDateString()}`)
            )
          )
        )
      )
  );
}

interface WalletConnectProps {
  onWalletsChange: (wallets: any) => void;
  onConnect: (wallets: any) => void;
  connectedWallet: any;
  isAuthenticating: boolean;
  onAuthenticate: () => void;
  wallets: any;
  onWalletAddressChange?: (address: string | null, profile: any) => void;
  onDisconnect?: () => void;
  authError?: string | null;
  user?: any;
  setWalletPubkey?: (pubkey: string | null) => void;
  selectedNetwork: NetworkOption;
  onNetworkChange: (network: NetworkOption) => void;


}

const NETWORKS = [
  { chainId: "terp-1", name: "Terp Network", rpc: "https://rpc.terp.network", gas: 0.001 },
  { chainId: "cosmoshub-4", name: "Cosmos Hub", rpc: "https://rpc.cosmos.network", gas: 0.001 },
  { chainId: "osmosis-1", name: "Osmosis", rpc: "https://rpc.osmosis.zone", gas: 0.0025 },
  { chainId: "juno-1", name: "Juno", rpc: "https://rpc.juno.nodestake.top", gas: 0.001 },
  { chainId: "stargaze-1", name: "Stargaze", rpc: "https://rpc.stargaze-apis.com", gas: 0.001 },
  { chainId: "injective-1", name: "Injective", rpc: "https://rpc.injective.network", gas: 0.0005 },
  { chainId: "dymension_1100-1", name: "Dymension", rpc: "https://rpc.dymension.nodestake.top", gas: 0.001 },
];

interface NetworkOption {
  chainId: string;
  name: string;
  rpc: string;
  gas: number;
}

interface KeplrWindow {
  keplr: any;
  cosmostation: any;
}

function WalletConnect({ onConnect, connectedWallet, setWalletPubkey, isAuthenticating, onAuthenticate, wallets, onWalletAddressChange, onDisconnect, authError, user, selectedNetwork, onNetworkChange }: WalletConnectProps) {
  const { t, locale } = useI18n();
  const [currentWallet, setCurrentWallet] = useState<ConnectedWallet | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedChain, setSelectedChain] = useState<string>("terp-1");
  const [selectedWalletName, setSelectedWalletName] = useState<WalletName>(WalletName.KEPLR);
  const [selectedWalletType, setSelectedWalletType] = useState<WalletType>(WalletType.EXTENSION);

  // Initialize event handlers once
  useEffect(() => {
    if (initialized) return;
    initializeWalletEvents((wallet) => {
      setCurrentWallet(wallet);
      if (wallet) {
        onConnect({ [wallet.address]: wallet });
      } else {
        onConnect({});
      }
    });
    setInitialized(true);
  }, [initialized, onConnect]);

  // Fetch pfpk profile when wallet changes
  useEffect(() => {
    const address = currentWallet?.address;
    if (!address) {
      setProfile(null);
      return;
    }

    const fetchPfpkProfile = async () => {
      try {
        const response = await fetch(`https://pfpk.daodao.zone/address/${address}`);
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          if (onWalletAddressChange) {
            onWalletAddressChange(address, data);
          }
        }
      } catch (err) {
        console.error("PFPK fetch failed:", err);
      }
    };

    fetchPfpkProfile();
  }, [currentWallet, onWalletAddressChange]);

  const handleConnect = useCallback(async () => {
    setLoading(true);
    try {
      setSelectedWallet(selectedWalletName, selectedWalletType);
      const wallet = await connectWallet(selectedChain, (w) => {
        setCurrentWallet(w);
      });
      if (wallet && wallet.address) {
        setWalletPubkey?.(wallet.pubkey || null);
      }
    } catch (err: any) {
      console.error("Wallet connection failed:", err?.message || err);
      alert("Wallet connection failed: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  }, [selectedChain, selectedWalletName, selectedWalletType, setWalletPubkey]);

  const handleDisconnect = useCallback(async () => {
    await disconnectWallet((w) => {
      setCurrentWallet(w);
      if (onWalletAddressChange) {
        onWalletAddressChange(null, null);
      }
    });
    setProfile(null);
    setWalletPubkey?.(null);
    if (onDisconnect) {
      onDisconnect();
    }
  }, [onWalletAddressChange, onDisconnect]);

  const displayWallet = currentWallet || (connectedWallet || (wallets && wallets[Object.keys(wallets)[0]])) || null;
  const displayAddress = displayWallet?.address || null;

  if (displayAddress) {
    const isAuthenticated = !!user;
    return h("div", { className: "wallet-connect-container" },
      h("div", { className: "wallet-profile" },
        profile?.nft?.imageUrl
          ? h("img", { src: profile.nft.imageUrl, className: "wallet-avatar", alt: "avatar" })
          : h("div", { className: "wallet-avatar-placeholder" }, "🚀"),
        h("span", { className: "wallet-name" }, profile?.name || displayAddress.slice(0, 12) + "..."),
        h("div", { className: "wallet-auth-section" },
          h(Button, {
            onClick: onAuthenticate,
            disabled: isAuthenticating || isAuthenticated,
            variant: isAuthenticated ? "outline" : "default",
            size: "sm"
          },
            isAuthenticating ? "Auth..." : isAuthenticated ? "✓" : "Auth"
          ),
          authError && h("span", { className: "wallet-auth-error" }, authError)
        ),
        h(Button, { onClick: handleDisconnect, variant: "outline", size: "sm" }, "Disconnect")
      )
    );
  }

  return h("div", { className: "wallet-connect-container" },
    h("div", { className: "wallet-controls" },
      h("select", {
        value: selectedChain,
        onChange: (e: any) => setSelectedChain(e.target.value),
        className: "wallet-select"
      },
        Object.keys(CHAINS).map(id => h("option", { key: id, value: id }, CHAINS[id]))
      ),
      h("select", {
        value: selectedWalletName,
        onChange: (e: any) => setSelectedWalletName(e.target.value as WalletName),
        className: "wallet-select"
      },
        Object.keys(WALLETS).map(w => h("option", { key: w, value: w }, WALLETS[w as WalletName]))
      ),
      h("select", {
        value: selectedWalletType,
        onChange: (e: any) => setSelectedWalletType(e.target.value as WalletType),
        className: "wallet-select"
      },
        Object.keys(TYPES).map(t => h("option", { key: t, value: t }, TYPES[t as WalletType]))
      )
    ),
    h(Button, { onClick: handleConnect, disabled: loading, variant: "default" },
      loading ? "Connecting..." : "Connect Wallet"
    )
  );
}

interface TaskModalProps {
  boardSlug: string;
  columns: any[];
  onClose: () => void;
  onSubmit: (data: { title: string; body: string; priority: string; column_id: string }) => void;
}

function TaskCreateModal({ boardSlug, columns, onClose, onSubmit }: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("medium");
  const [columnId, setColumnId] = useState(columns[0]?.id || "todo");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), body, priority, column_id: columnId });
    onClose();
  };

  return h("div", { className: "modal-overlay", onClick: onClose },
    h("div", { className: "modal-content", onClick: (e: any) => e.stopPropagation() },
      h("h3", null, "Create Task"),
      h("form", { onSubmit: handleSubmit },
        h("div", { className: "form-group" },
          h(Label, null, "Title"),
          h(Input, { value: title, onChange: (e: any) => setTitle(e.target.value), placeholder: "Task title", required: true })
        ),
        h("div", { className: "form-group" },
          h(Label, null, "Description"),
          h("textarea", {
            value: body,
            onChange: (e: any) => setBody(e.target.value),
            placeholder: "Task description (optional)",
            className: "textarea-input",
            rows: 4
          })
        ),
        h("div", { className: "form-row" },
          h("div", { className: "form-group" },
            h(Label, null, "Priority"),
            h(Select, { value: priority, onValueChange: setPriority },
              h(SelectOption, { value: "low" }, "Low"),
              h(SelectOption, { value: "medium" }, "Medium"),
              h(SelectOption, { value: "high" }, "High")
            )
          ),
          h("div", { className: "form-group" },
            h(Label, null, "Column"),
            h(Select, { value: columnId, onValueChange: setColumnId },
              columns.map((col: any) => h(SelectOption, { key: col.id, value: col.id }, col.title))
            )
          )
        ),
        h("div", { className: "modal-actions" },
          h(Button, { type: "button", variant: "outline", onClick: onClose }, "Cancel"),
          h(Button, { type: "submit" }, "Create Task")
        )
      )
    )
  );
}

interface ShareDialogProps {
  boardSlug: string;
  onClose: () => void;
}

function ShareDialog({ boardSlug, onClose }: ShareDialogProps) {
  const [role, setRole] = useState("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.share.list(boardSlug).then(setShares).catch(console.error);
  }, [boardSlug]);

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await api.share.create(boardSlug, role, undefined, expiresAt || undefined);
      const link = `${window.location.origin}/terp-kanban?share=${result.token}`;
      setShareLink(link);
      setShares(prev => [...prev, result]);
    } catch (err) {
      console.error("Failed to create share:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    if (!confirm("Revoke this share link?")) return;
    try {
      await api.share.revoke(shareId);
      setShares(prev => prev.filter(s => s.id !== shareId));
      if (shareLink && shareLink.includes(shareId)) setShareLink(null);
    } catch (err) {
      console.error("Failed to revoke share:", err);
    }
  };

  return h("div", { className: "modal-overlay", onClick: onClose },
    h("div", { className: "modal-content modal-wide", onClick: (e: any) => e.stopPropagation() },
      h("h3", null, "Share Board"),
      h("div", { className: "form-group" },
        h(Label, null, "Role"),
        h(Select, { value: role, onValueChange: setRole },
          h(SelectOption, { value: "viewer" }, "Viewer (can view only)"),
          h(SelectOption, { value: "editor" }, "Editor (can view and create tasks)")
        )
      ),
      h("div", { className: "form-group" },
        h(Label, null, "Expires At (optional)"),
        h(Input, {
          type: "datetime-local",
          value: expiresAt,
          onChange: (e: any) => setExpiresAt(e.target.value),
          placeholder: "Leave empty for no expiration"
        })
      ),
      h(Button, { onClick: handleCreate, disabled: loading }, loading ? "Creating..." : "Generate Share Link"),
      shareLink && h("div", { className: "share-link-box" },
        h("p", null, "Share this link:"),
        h("input", { type: "text", value: shareLink, readOnly: true, className: "share-link-input" }),
        h(Button, { onClick: () => { navigator.clipboard.writeText(shareLink); alert("Copied!"); }, size: "sm" }, "Copy")
      ),
      shares.length > 0 && h("div", { className: "shares-list" },
        h("h4", null, "Active Shares"),
        shares.map(share =>
          h("div", { key: share.id, className: "share-item" },
            h("span", null, `${share.role} - expires: ${new Date(share.expires_at * 1000).toLocaleString()}`),
            h(Button, { onClick: () => handleRevoke(share.id), variant: "outline", size: "sm" }, "Revoke")
          )
        )
      ),
      h(Button, { onClick: onClose, variant: "outline", className: "modal-close-btn" }, "Close")
    )
  );
}

interface MemberPanelProps {
  boardSlug: string;
  onClose: () => void;
}

function MemberPanel({ boardSlug, onClose }: MemberPanelProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.member.list(boardSlug)
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [boardSlug]);

  const handleAddMember = async () => {
    if (!newAddress.trim()) return;
    try {
      const member = await api.member.add(boardSlug, { wallet_addr: newAddress.trim(), role: newRole });
      setMembers(prev => [...prev, member]);
      setNewAddress("");
    } catch (err) {
      console.error("Failed to add member:", err);
    }
  };

  const handleUpdateRole = async (addr: string, role: string) => {
    try {
      const updated = await api.member.updateRole(boardSlug, addr, { role });
      setMembers(prev => prev.map(m => m.wallet_addr === addr ? { ...m, role } : m));
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const handleRemove = async (addr: string) => {
    if (!confirm("Remove this member?")) return;
    try {
      await api.member.remove(boardSlug, addr);
      setMembers(prev => prev.filter(m => m.wallet_addr !== addr));
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  return h("div", { className: "modal-overlay", onClick: onClose },
    h("div", { className: "modal-content modal-wide", onClick: (e: any) => e.stopPropagation() },
      h("h3", null, "Board Members"),
      loading ? h("p", null, "Loading...") :
        h("div", { className: "members-list" },
          members.map(member =>
            h("div", { key: member.wallet_addr, className: "member-item" },
              h("div", { className: "member-info" },
                h("span", { className: "member-address" }, member.wallet_addr.slice(0, 14) + "..."),
                member.author_name && h("span", { className: "member-name" }, member.author_name)
              ),
              h(Select, {
                value: member.role,
                onValueChange: (r: string) => handleUpdateRole(member.wallet_addr, r),
                disabled: member.role === "admin"
              },
                h(SelectOption, { value: "admin" }, "Admin"),
                h(SelectOption, { value: "editor" }, "Editor"),
                h(SelectOption, { value: "viewer" }, "Viewer")
              ),
              member.role !== "admin" && h(Button, { onClick: () => handleRemove(member.wallet_addr), variant: "outline", size: "sm" }, "Remove")
            )
          )
        ),
      h("div", { className: "add-member-form" },
        h("h4", null, "Add Member"),
        h("div", { className: "form-row" },
          h(Input, {
            value: newAddress,
            onChange: (e: any) => setNewAddress(e.target.value),
            placeholder: "Wallet address"
          }),
          h(Select, { value: newRole, onValueChange: setNewRole },
            h(SelectOption, { value: "viewer" }, "Viewer"),
            h(SelectOption, { value: "editor" }, "Editor")
          ),
          h(Button, { onClick: handleAddMember }, "Add")
        )
      ),
      h(Button, { onClick: onClose, variant: "outline", className: "modal-close-btn" }, "Close")
    )
  );
}

export default function TerpKanban() {
  const { t, locale } = useI18n();
  const [selectedBoardSlug, setSelectedBoardSlug] = useState<string | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<any>(null);
  const [wallets, setWallets] = useState<any>({});
  const [user, setUser] = useState<any>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletPubkey, setWalletPubkey] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<any>(NETWORKS[0]);
  const [boards, setBoards] = useState<any[]>([]);
  const [boardData, setBoardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    api.board.list()
      .then(setBoards)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedBoardSlug) {
      api.board.get(selectedBoardSlug)
        .then(setBoardData)
        .catch(console.error);
    } else {
      setBoardData(null);
    }
  }, [selectedBoardSlug]);

  const handleWalletConnect = useCallback((newWallets: any) => {
    setWallets(newWallets);
    const wallet = newWallets[Object.keys(newWallets)[0]] || null;
    setConnectedWallet(wallet);
  }, []);

  const handleWalletAddressChange = useCallback((addr: string | null, prof: any) => {
    setWalletAddress(addr);
    setProfile(prof);
  }, []);

  function getDenom(chain: string): string {
    switch (chain) {
      case "osmosis-1":
        return "uosmo";
      case "juno-1":
        return "ujuno";
      case "kaiyo-1":
        return "ukuji";
      case "phoenix-1":
      case "columbus-5":
        return "uluna";
      case "neutron-1":
        return "untrn";
      case "migaloo-1":
        return "uwhale";
      case "injective-1":
        return "inj";
      case "pacific-1":
        return "usei";
      case "dymension_1100-1":
        return "adym";
      case "Oraichain":
        return "orai";
      default:
        throw new Error("Unknown chain");
    }
  }

  function getGasPrice(chain: string): { amount: string; denom: string } {
    switch (chain) {
      case "osmosis-1":
        return { amount: "0.0025", denom: getDenom(chain) };
      case "juno-1":
        return { amount: "0.001", denom: getDenom(chain) };
      case "kaiyo-1":
        return { amount: "0.00119", denom: getDenom(chain) };
      case "phoenix-1":
        return { amount: "0.015", denom: getDenom(chain) };
      case "columbus-5":
        return { amount: "28.325", denom: getDenom(chain) };
      case "neutron-1":
        return { amount: "0.01", denom: getDenom(chain) };
      case "migaloo-1":
        return { amount: "1", denom: getDenom(chain) };
      case "injective-1":
        return { amount: "500000000", denom: getDenom(chain) };
      case "pacific-1":
        return { amount: "0.1", denom: getDenom(chain) };
      case "dymension_1100-1":
        return { amount: "20000000000", denom: getDenom(chain) };
      case "Oraichain":
        return { amount: "0.003", denom: getDenom(chain) };
      default:
        throw new Error("Unknown chain");
    }
  }

  const handleAuthenticate = useCallback(async () => {
    if (!walletAddress || isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      // Simply create a session based on connected wallet - no signature required
      const result = await fetchApi("/wallet/session", {
        method: "POST",
        body: JSON.stringify({
          address: walletAddress,
          chain_id: selectedNetwork?.chainId,
        }),
      });
      if (result.session_token) {
        setWalletSessionToken(result.session_token);
      }
      setUser({ wallet_addr: walletAddress, chain_id: selectedNetwork?.chainId });
      setAuthError(null);
    } catch (error: any) {
      console.error("Auth failed:", error);
      setAuthError(error?.message || "Authentication failed");
      setUser(null);
    } finally {
      setIsAuthenticating(false);
    }
  }, [connectedWallet, walletAddress, selectedNetwork, isAuthenticating]);

  const handleCreateBoard = useCallback(() => {
    const name = prompt("Enter board name:");
    if (!name?.trim()) return;
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const data = {
      slug,
      name: name.trim(),
      author_name: profile?.name || walletAddress?.slice(0, 12) || "Anonymous",
      chain_id: selectedNetwork?.chainId || "terp-1",
    };
    api.board.create(data)
      .then((newBoard: any) => {
        setBoards(prev => [...prev, newBoard]);
        setSelectedBoardSlug(newBoard.slug);
      })
      .catch(console.error);
  }, [walletAddress, profile, selectedNetwork]);

  const handleDeleteBoard = useCallback((slug: string) => {
    if (!confirm("Delete this board?")) return;
    api.board.delete(slug)
      .then(() => {
        setBoards(prev => prev.filter(b => b.slug !== slug));
        if (selectedBoardSlug === slug) {
          setSelectedBoardSlug(null);
        }
      })
      .catch(console.error);
  }, [selectedBoardSlug]);

  const handleCreateTask = useCallback((boardSlug: string) => {
    if (user?.role !== "admin") {
      alert("Only admins can create tasks");
      return;
    }
    setSelectedBoardSlug(boardSlug);
    setShowTaskModal(true);
  }, [user]);

  const handleTaskModalSubmit = useCallback((data: { title: string; body: string; priority: string; column_id: string }) => {
    if (!selectedBoardSlug) return;
    api.task.create({
      board_slug: selectedBoardSlug,
      ...data,
    })
      .then(() => api.board.get(selectedBoardSlug).then(setBoardData))
      .catch(console.error);
  }, [selectedBoardSlug]);

  const handleMoveTask = useCallback(({ taskIds, column_id }: { taskIds: string[]; column_id: string }) => {
    api.task.bulk({ task_ids: taskIds, column_id })
      .then(() => selectedBoardSlug && api.board.get(selectedBoardSlug).then(setBoardData))
      .catch(console.error);
  }, [selectedBoardSlug]);

  if (loading) {
    return h("div", { className: "hermes-kanban-loading" }, "Loading...");
  }

  return h("div", { className: "hermes-kanban-app" },
    h("div", { className: "hermes-kanban-header" },
      h("h1", null, "Terp Kanban"),
      h(WalletConnect, {
        onWalletsChange: handleWalletConnect,
        setWalletPubkey: setWalletPubkey,
        onConnect: handleWalletConnect,
        connectedWallet,
        isAuthenticating,
        onAuthenticate: handleAuthenticate,
        wallets,
        onWalletAddressChange: handleWalletAddressChange,
        onDisconnect: () => { setWalletSessionToken(null); setUser(null); },
        authError,
        user,
        selectedNetwork,
        onNetworkChange: setSelectedNetwork,
      })
    ),
    selectedBoardSlug
      ? h(BoardView, {
        boardData,
        user,
        onCreateTask: handleCreateTask,
        onUpdateTask: () => { },
        onMoveTask: handleMoveTask,
        onOpenShare: () => setShowShareDialog(true),
        onOpenMembers: () => setShowMemberPanel(true),
      })
      : h(BoardList, {
        boards,
        onSelect: setSelectedBoardSlug,
        onDelete: handleDeleteBoard,
        user,
      }),
    user && h(Button, { onClick: () => setSelectedBoardSlug(null), className: "hermes-kanban-back-btn" }, "← Back to Boards"),
    user && h(Button, { onClick: handleCreateBoard, className: "hermes-kanban-create-btn" }, "Create Board"),
    showTaskModal && selectedBoardSlug && h(TaskCreateModal, {
      boardSlug: selectedBoardSlug,
      columns: boardData?.columns || [],
      onClose: () => setShowTaskModal(false),
      onSubmit: handleTaskModalSubmit,
    }),
    showShareDialog && selectedBoardSlug && h(ShareDialog, {
      boardSlug: selectedBoardSlug,
      onClose: () => setShowShareDialog(false),
    }),
    showMemberPanel && selectedBoardSlug && h(MemberPanel, {
      boardSlug: selectedBoardSlug,
      onClose: () => setShowMemberPanel(false),
    })
  );
}
