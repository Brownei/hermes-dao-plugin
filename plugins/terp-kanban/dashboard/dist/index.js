/**
 * Terp Kanban — Wallet-protected Kanban boards
 *
 * Optional Cosmos wallet (Keplr/Leap/Cosmostation) for board creation,
 * member management, and JWT share links. Boards are rendered via iframe
 * to the existing kanban plugin — no duplicate UI.
 *
 * Plain IIFE, no build step. Uses window.__HERMES_PLUGIN_SDK__ for React
 * + shadcn primitives; theme CSS vars for colors.
 */
(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  var React = SDK.React;
  var h = React.createElement;
  var Card = SDK.components.Card;
  var CardContent = SDK.components.CardContent;
  var CardHeader = SDK.components.CardHeader;
  var CardTitle = SDK.components.CardTitle;
  var CardDescription = SDK.components.CardDescription;
  var Badge = SDK.components.Badge;
  var Button = SDK.components.Button;
  var Input = SDK.components.Input;
  var Label = SDK.components.Label;
  var Select = SDK.components.Select;
  var SelectOption = SDK.components.SelectOption;
  var useState = SDK.hooks.useState;
  var useEffect = SDK.hooks.useEffect;
  var useCallback = SDK.hooks.useCallback;
  var cn = SDK.utils.cn;

  // -------------------------------------------------------------------------
  // Wallet Connector — native wallet extension APIs (Keplr / Leap / Cosmostation)
  // -------------------------------------------------------------------------

  var NATIVE_CHAINS = {
    "osmosis-1": true,
    "cosmoshub-4": true,
    "juno-1": true,
    "stargaze-1": true,
    "secret-4": true,
    "akashnet-2": true,
    "core-1": true,
    "evmos_9001-2": true,
    "injective-1": true,
    "stride-1": true,
    "neutron-1": true,
    "celestia": true,
    "dymension_1100-1": true,
  };

  var WalletConnector = {
    connectedWallet: null,
    activeWalletName: null,
    offlineSigner: null,
    activeChainId: null,

    _getWalletObject: function (walletName) {
      switch (walletName) {
        case "keplr": return window.keplr;
        case "leap": return window.leap;
        case "cosmostation":
          return window.cosmostation && window.cosmostation.providers
            ? window.cosmostation.providers.keplr
            : null;
        default: return null;
      }
    },

    isInstalled: function (walletName) {
      return !!this._getWalletObject(walletName);
    },

    _suggestChain: async function (walletObj, chain) {
      if (NATIVE_CHAINS[chain.chain_id]) return;
      var rawDenom = chain.gas_price ? chain.gas_price.replace(/[0-9.]/g, "") : "token";
      var displayDenom = rawDenom.startsWith("u") ? rawDenom.slice(1).toUpperCase() : rawDenom.toUpperCase();
      var chainInfo = {
        chainId: chain.chain_id,
        chainName: chain.label || chain.chain_id,
        rpc: chain.rpc,
        rest: chain.rest,
        bip44: { coinType: 118 },
        bech32Config: {
          bech32PrefixAccAddr: chain.bech32_prefix,
          bech32PrefixAccPubkey: chain.bech32_prefix + "pub",
          bech32PrefixValAddr: chain.bech32_prefix + "valoper",
          bech32PrefixValPubkey: chain.bech32_prefix + "valoperpub",
          bech32PrefixConsAddr: chain.bech32_prefix + "valcons",
          bech32PrefixConsPubkey: chain.bech32_prefix + "valconspub",
        },
        currencies: [{ coinDenom: displayDenom, coinMinimalDenom: rawDenom, coinDecimals: 6 }],
        feeCurrencies: [{ coinDenom: displayDenom, coinMinimalDenom: rawDenom, coinDecimals: 6, gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 } }],
        stakeCurrency: { coinDenom: displayDenom, coinMinimalDenom: rawDenom, coinDecimals: 6 },
        features: [],
      };
      try {
        if (walletObj.experimentalSuggestChain) {
          await walletObj.experimentalSuggestChain(chainInfo);
        }
      } catch (e) {
        // Chain may already be added or wallet doesn't support suggest
      }
    },

    connect: async function (chain, walletName) {
      var walletObj = this._getWalletObject(walletName);
      if (!walletObj) {
        throw new Error(
          walletName.charAt(0).toUpperCase() + walletName.slice(1) +
          " extension not found. Please install it."
        );
      }
      await this._suggestChain(walletObj, chain);
      await walletObj.enable(chain.chain_id);
      var key = await walletObj.getKey(chain.chain_id);
      var signer = walletObj.getOfflineSignerAuto
        ? await walletObj.getOfflineSignerAuto(chain.chain_id)
        : walletObj.getOfflineSigner(chain.chain_id);
      this.connectedWallet = {
        address: key.bech32Address,
        pubkey: key.pubkey,
        name: key.name,
      };
      this.offlineSigner = signer;
      this.activeWalletName = walletName;
      this.activeChainId = chain.chain_id;
      return {
        address: key.bech32Address,
        chainId: chain.chain_id,
        wallet: this.connectedWallet,
      };
    },

    signChallenge: async function (_controller, _chain, message) {
      if (!this.connectedWallet || !this.offlineSigner) {
        throw new Error("No connected wallet. Call connect() first.");
      }
      var msgBytes = new TextEncoder().encode(message);
      var hashBuffer = await crypto.subtle.digest("SHA-256", msgBytes);
      var hashArray = new Uint8Array(hashBuffer);
      var signature = await this.offlineSigner.sign(
        this.connectedWallet.address,
        hashArray
      );
      return {
        signature: btoa(String.fromCharCode.apply(null, signature.signature)),
        pubkey: btoa(String.fromCharCode.apply(null, this.connectedWallet.pubkey)),
        address: this.connectedWallet.address,
      };
    },

    disconnect: async function () {
      this.connectedWallet = null;
      this.offlineSigner = null;
      this.activeWalletName = null;
      this.activeChainId = null;
    },
  };

  // -------------------------------------------------------------------------
  // Wallet session manager
  // -------------------------------------------------------------------------

  var WALLET_SESSION_KEY = "terp_kanban_wallet_session";

  var WalletSession = {
    get: function () {
      try {
        var raw = localStorage.getItem(WALLET_SESSION_KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (s.expires_at && s.expires_at < Date.now() / 1000) {
          localStorage.removeItem(WALLET_SESSION_KEY);
          return null;
        }
        return s;
      } catch (e) { return null; }
    },
    set: function (session) {
      localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify(session));
    },
    clear: function () {
      localStorage.removeItem(WALLET_SESSION_KEY);
    },
    hasValid: function () { return !!this.get(); },
    headers: function () {
      var s = this.get();
      return s ? { "x-wallet-session": s.session_token } : {};
    },
  };

  // -------------------------------------------------------------------------
  // Wallet API helpers
  // -------------------------------------------------------------------------

  var WALLET_API = "/api/plugins/terp-kanban";

  function _apiHeaders() {
    var headers = { "Content-Type": "application/json" };
    var sessionToken = window.__HERMES_SESSION_TOKEN__;
    if (sessionToken) {
      headers["X-Hermes-Session-Token"] = sessionToken;
    }
    Object.assign(headers, WalletSession.headers());
    return headers;
  }

  function walletApiGet(path, params) {
    var qs = params
      ? "?" + Object.keys(params).map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
        }).join("&")
      : "";
    return fetch(WALLET_API + path + qs, {
      method: "GET",
      headers: _apiHeaders(),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (err) { throw new Error(err.detail || "Request failed"); });
      }
      return r.json();
    });
  }

  function walletApiPost(path, body) {
    return fetch(WALLET_API + path, {
      method: "POST",
      headers: _apiHeaders(),
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (err) { throw new Error(err.detail || "Request failed"); });
      }
      return r.json();
    });
  }

  function walletApiDelete(path) {
    return fetch(WALLET_API + path, {
      method: "DELETE",
      headers: _apiHeaders(),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (err) { throw new Error(err.detail || "Request failed"); });
      }
      return r.json();
    });
  }

  function walletApiPatch(path, body) {
    return fetch(WALLET_API + path, {
      method: "PATCH",
      headers: _apiHeaders(),
      body: JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (err) { throw new Error(err.detail || "Request failed"); });
      }
      return r.json();
    });
  }

  function truncateAddress(addr) {
    if (!addr) return "";
    return addr.slice(0, 8) + "..." + addr.slice(-6);
  }

  // -------------------------------------------------------------------------
  // Wallet Connect Modal (uses SDK components, theme vars)
  // -------------------------------------------------------------------------

  function WalletConnectModal(props) {
    var state = useState({
      step: "select",
      selectedChain: null,
      selectedWallet: "keplr",
      error: null,
      chains: [],
    });
    var s = state[0];
    var setS = state[1];

    useEffect(function () {
      walletApiGet("/wallet/config")
        .then(function (cfg) {
          var chains = cfg.chains || [];
          var defaultChain = chains.find(function (c) { return c.chain_id === "osmosis-1"; }) || chains[0] || null;
          setS(function (prev) {
            return Object.assign({}, prev, { chains: chains, selectedChain: defaultChain });
          });
        })
        .catch(function (err) {
          setS(function (prev) {
            return Object.assign({}, prev, { error: "Failed to load config: " + err.message });
          });
        });
    }, []);

    var handleConnect = useCallback(async function () {
      if (!s.selectedChain) {
        setS(function (prev) {
          return Object.assign({}, prev, { error: "Please select a chain" });
        });
        return;
      }
      setS(function (prev) { return Object.assign({}, prev, { step: "connecting", error: null }); });
      try {
        await WalletConnector.connect(s.selectedChain, s.selectedWallet);
        setS(function (prev) { return Object.assign({}, prev, { step: "signing" }); });
        var challenge = await walletApiGet("/wallet/challenge", { chain_id: s.selectedChain.chain_id });
        var sigResult = await WalletConnector.signChallenge(null, s.selectedChain, challenge.message);
        var session = await walletApiPost("/wallet/verify", {
          address: sigResult.address,
          signature: sigResult.signature,
          pubkey: sigResult.pubkey,
          chain_id: s.selectedChain.chain_id,
          challenge_nonce: challenge.nonce,
        });
        WalletSession.set(session);
        if (props.onConnected) props.onConnected(session);
      } catch (err) {
        setS(function (prev) {
          return Object.assign({}, prev, { step: "error", error: err.message || "Connection failed" });
        });
      }
    }, [s.selectedChain, s.selectedWallet, props.onConnected]);

    if (s.step === "connecting") {
      return h("div", { className: "fixed inset-0 bg-black/70 flex items-center justify-center z-50" },
        h(Card, null, h(CardContent, { className: "p-6" },
          h("p", { className: "text-sm text-muted-foreground" }, "Connecting to wallet...")
        ))
      );
    }
    if (s.step === "signing") {
      return h("div", { className: "fixed inset-0 bg-black/70 flex items-center justify-center z-50" },
        h(Card, null, h(CardContent, { className: "p-6" },
          h("p", { className: "text-sm text-muted-foreground" }, "Please sign the challenge in your wallet...")
        ))
      );
    }

    return h("div", {
      className: "fixed inset-0 bg-black/70 flex items-center justify-center z-50",
      onClick: function (e) { if (e.target === e.currentTarget && props.onClose) props.onClose(); },
    },
      h(Card, { className: "w-full max-w-md relative" },
        h("button", {
          className: "absolute right-4 top-4 text-muted-foreground hover:text-foreground",
          onClick: function () { if (props.onClose) props.onClose(); },
        }, "\u00d7"),
        h(CardHeader, null,
          h(CardTitle, null, "Connect Wallet"),
          h(CardDescription, null, "Connect your Cosmos wallet to create boards and manage access.")
        ),
        h(CardContent, null,
          s.error ? h("div", { className: "mb-4 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive" }, s.error) : null,

          h("div", { className: "space-y-4" },
            h("div", { className: "space-y-2" },
              h(Label, null, "Chain"),
              h(Select, Object.assign({
                value: s.selectedChain ? s.selectedChain.chain_id : "",
                onValueChange: function (v) {
                  var chain = s.chains.find(function (c) { return c.chain_id === v; });
                  setS(function (prev) { return Object.assign({}, prev, { selectedChain: chain }); });
                },
              }, { placeholder: "Select a chain..." }),
                s.chains.map(function (chain) {
                  return h(SelectOption, { key: chain.chain_id, value: chain.chain_id }, chain.label || chain.chain_id);
                })
              )
            ),

            h("div", { className: "space-y-2" },
              h(Label, null, "Wallet"),
              h("div", { className: "flex gap-2" },
                ["keplr", "leap", "cosmostation"].map(function (w) {
                  var isSelected = s.selectedWallet === w;
                  return h(Button, {
                    key: w,
                    variant: isSelected ? "default" : "outline",
                    size: "sm",
                    onClick: function () {
                      setS(function (prev) { return Object.assign({}, prev, { selectedWallet: w }); });
                    },
                  }, w.charAt(0).toUpperCase() + w.slice(1));
                })
              )
            ),

            h(Button, {
              className: "w-full",
              onClick: handleConnect,
              disabled: !s.selectedChain,
            }, "Connect & Sign")
          )
        )
      )
    );
  }

  // -------------------------------------------------------------------------
  // Lightweight Board Viewer — fetches from kanban API, renders columns/cards
  // No navbar, no chrome — just the board columns.
  // -------------------------------------------------------------------------

  var KANBAN_API = "/api/plugins/kanban";
  var COLUMN_ORDER = ["triage", "todo", "ready", "running", "blocked", "done"];
  var COLUMN_LABELS = {
    triage: "Triage",
    todo: "Todo",
    ready: "Ready",
    running: "In Progress",
    blocked: "Blocked",
    done: "Done",
  };
  var COLUMN_DOT_COLORS = {
    triage: "bg-yellow-500",
    todo: "bg-blue-500",
    ready: "bg-green-500",
    running: "bg-orange-500",
    blocked: "bg-red-500",
    done: "bg-gray-500",
  };
  var PRIORITY_LABELS = { 3: "Urgent", 2: "High", 1: "Medium", 0: "Low" };
  var PRIORITY_VARIANTS = { 3: "destructive", 2: "default", 1: "secondary", 0: "outline" };

  function kanbanApiGet(path, params) {
    var qs = params
      ? "?" + Object.keys(params).map(function (k) {
          return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
        }).join("&")
      : "";
    var sessionToken = window.__HERMES_SESSION_TOKEN__;
    var headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["X-Hermes-Session-Token"] = sessionToken;
    return fetch(KANBAN_API + path + qs, { method: "GET", headers: headers })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (err) { throw new Error(err.detail || "Request failed"); });
        return r.json();
      });
  }

  function timeAgo(ts) {
    if (!ts) return "";
    var diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return "just now";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }

  function TaskCard(props) {
    var task = props.task;
    var priority = task.priority || 0;
    var pLabel = PRIORITY_LABELS[priority] || "";
    var pVariant = PRIORITY_VARIANTS[priority] || "outline";

    return h("div", {
      className: "rounded-md border bg-card p-3 mb-2 cursor-pointer hover:border-ring/50 transition-colors",
      onClick: function () { if (props.onOpen) props.onOpen(task.id); },
    },
      h("div", { className: "flex items-start justify-between gap-2" },
        h("p", { className: "text-sm font-medium leading-tight flex-1" }, task.title),
        priority > 0 ? h(Badge, { variant: pVariant, className: "text-[10px] shrink-0" }, pLabel) : null
      ),
      h("div", { className: "flex items-center gap-2 mt-2" },
        task.assignee ? h(Badge, { variant: "outline", className: "text-[10px]" }, task.assignee) : null,
        task.created_at ? h("span", { className: "text-[10px] text-muted-foreground ml-auto" }, timeAgo(task.created_at)) : null
      )
    );
  }

  function BoardColumn(props) {
    var column = props.column;
    var tasks = column.tasks || [];
    var dotColor = COLUMN_DOT_COLORS[column.name] || "bg-muted-foreground";
    var label = COLUMN_LABELS[column.name] || column.name;

    return h("div", { className: "flex flex-col min-w-[220px] max-w-[320px] flex-1" },
      h("div", { className: "flex items-center gap-2 mb-3 px-1" },
        h("span", { className: "h-2 w-2 rounded-full " + dotColor }),
        h("span", { className: "text-sm font-semibold" }, label),
        h(Badge, { variant: "secondary", className: "text-[10px] ml-auto" }, tasks.length)
      ),
      h("div", { className: "space-y-0 overflow-y-auto max-h-[calc(100vh-10rem)] pr-1" },
        tasks.length === 0
          ? h("div", { className: "rounded-md border border-dashed p-4 text-center" },
              h("p", { className: "text-xs text-muted-foreground" }, "No tasks")
            )
          : tasks.map(function (task) {
              return h(TaskCard, { key: task.id, task: task, onOpen: props.onOpenTask });
            })
      )
    );
  }

  function LightweightBoardView(props) {
    var boardSlug = props.boardSlug;
    var state = useState({ columns: [], loading: true, error: null });
    var s = state[0];
    var setS = state[1];

    var loadBoard = useCallback(function () {
      setS(function (prev) { return Object.assign({}, prev, { loading: true }); });
      kanbanApiGet("/board", { board: boardSlug })
        .then(function (data) {
          var cols = (data.columns || []).filter(function (c) { return COLUMN_ORDER.indexOf(c.name) >= 0; });
          cols.sort(function (a, b) { return COLUMN_ORDER.indexOf(a.name) - COLUMN_ORDER.indexOf(b.name); });
          setS(function (prev) { return Object.assign({}, prev, { columns: cols, loading: false }); });
        })
        .catch(function (err) {
          setS(function (prev) { return Object.assign({}, prev, { loading: false, error: err.message }); });
        });
    }, [boardSlug]);

    useEffect(function () { loadBoard(); }, [loadBoard]);

    var handleOpenTask = function (taskId) {
      window.open("/kanban?board=" + encodeURIComponent(boardSlug), "_blank");
    };

    if (s.loading) {
      return h("div", { className: "flex items-center justify-center py-16" },
        h("p", { className: "text-sm text-muted-foreground" }, "Loading board...")
      );
    }
    if (s.error) {
      return h("div", { className: "rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive" }, s.error);
    }

    return h("div", null,
      h("div", { className: "flex items-center gap-3 mb-4" },
        h("h3", { className: "text-base font-semibold" }, boardSlug),
        h(Button, { variant: "outline", size: "sm", className: "ml-auto", onClick: function () { window.open("/kanban?board=" + encodeURIComponent(boardSlug), "_blank"); } }, "Open full board")
      ),
      h("div", { className: "flex gap-4 overflow-x-auto pb-4" },
        s.columns.map(function (col) {
          return h(BoardColumn, { key: col.name, column: col, onOpenTask: handleOpenTask });
        })
      )
    );
  }

  // -------------------------------------------------------------------------
  // Create Board Form
  // -------------------------------------------------------------------------

  function CreateBoardForm(props) {
    var state = useState({ slug: "", name: "", description: "", icon: "", color: "", loading: false, error: null });
    var s = state[0];
    var setS = state[1];

    var handleSubmit = useCallback(async function (e) {
      e.preventDefault();
      if (!s.slug || !s.name) return;
      setS(function (prev) { return Object.assign({}, prev, { loading: true, error: null }); });
      try {
        var result = await walletApiPost("/wallet/boards", {
          slug: s.slug, name: s.name, description: s.description, icon: s.icon, color: s.color,
        });
        if (props.onCreated) props.onCreated(result.board);
      } catch (err) {
        setS(function (prev) { return Object.assign({}, prev, { loading: false, error: err.message || "Failed to create board" }); });
      }
    }, [s.slug, s.name, s.description, s.icon, s.color, props.onCreated]);

    return h(Card, null,
      h(CardHeader, null,
        h(CardTitle, null, "Create New Board"),
        h(CardDescription, null, "Create a wallet-authenticated board with you as admin.")
      ),
      h(CardContent, null,
        s.error ? h("div", { className: "mb-4 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive" }, s.error) : null,
        h("form", { onSubmit: handleSubmit, className: "space-y-4" },
          h("div", { className: "space-y-2" },
            h(Label, null, "Slug"),
            h(Input, { value: s.slug, placeholder: "my-project", onChange: function (e) { setS(function (p) { return Object.assign({}, p, { slug: e.target.value }); }); } })
          ),
          h("div", { className: "space-y-2" },
            h(Label, null, "Name"),
            h(Input, { value: s.name, placeholder: "My Project", onChange: function (e) { setS(function (p) { return Object.assign({}, p, { name: e.target.value }); }); } })
          ),
          h("div", { className: "space-y-2" },
            h(Label, null, "Description"),
            h(Input, { value: s.description, placeholder: "Optional", onChange: function (e) { setS(function (p) { return Object.assign({}, p, { description: e.target.value }); }); } })
          ),
          h("div", { className: "grid grid-cols-2 gap-4" },
            h("div", { className: "space-y-2" },
              h(Label, null, "Icon"),
              h(Input, { value: s.icon, placeholder: "emoji", onChange: function (e) { setS(function (p) { return Object.assign({}, p, { icon: e.target.value }); }); } })
            ),
            h("div", { className: "space-y-2" },
              h(Label, null, "Color"),
              h(Input, { type: "color", value: s.color, onChange: function (e) { setS(function (p) { return Object.assign({}, p, { color: e.target.value }); }); } })
            )
          ),
          h(Button, { type: "submit", className: "w-full", disabled: s.loading || !s.slug || !s.name },
            s.loading ? "Creating..." : "Create Board"
          )
        )
      )
    );
  }

  // -------------------------------------------------------------------------
  // Board Members Manager
  // -------------------------------------------------------------------------

  function BoardMembersManager(props) {
    var boardSlug = props.boardSlug;
    var myRole = props.myRole || "viewer";
    var isAdmin = myRole === "admin";
    var state = useState({
      members: [], loading: true, error: null, success: null,
      newAddr: "", newRole: "viewer",
    });
    var s = state[0];
    var setS = state[1];

    var loadMembers = useCallback(function () {
      setS(function (prev) { return Object.assign({}, prev, { loading: true }); });
      walletApiGet("/wallet/boards/" + boardSlug + "/members")
        .then(function (data) {
          setS(function (prev) { return Object.assign({}, prev, { members: data.members || [], loading: false }); });
        })
        .catch(function (err) {
          setS(function (prev) { return Object.assign({}, prev, { loading: false, error: err.message || "Failed to load members" }); });
        });
    }, [boardSlug]);

    useEffect(function () { loadMembers(); }, [loadMembers]);

    var handleAdd = useCallback(async function () {
      if (!s.newAddr) return;
      setS(function (prev) { return Object.assign({}, prev, { error: null, success: null }); });
      try {
        await walletApiPost("/wallet/boards/" + boardSlug + "/members", {
          wallet_addr: s.newAddr, role: s.newRole,
        });
        setS(function (prev) { return Object.assign({}, prev, { newAddr: "", success: "Member added" }); });
        loadMembers();
      } catch (err) {
        setS(function (prev) { return Object.assign({}, prev, { error: err.message || "Failed to add member" }); });
      }
    }, [s.newAddr, s.newRole, boardSlug, loadMembers]);

    var handleRemove = useCallback(async function (addr) {
      if (!confirm("Remove " + truncateAddress(addr) + "?")) return;
      try {
        await walletApiDelete("/wallet/boards/" + boardSlug + "/members/" + addr);
        loadMembers();
      } catch (err) {
        setS(function (prev) { return Object.assign({}, prev, { error: err.message || "Failed to remove" }); });
      }
    }, [boardSlug, loadMembers]);

    var handleChangeRole = useCallback(async function (addr, newRole) {
      try {
        await walletApiPatch("/wallet/boards/" + boardSlug + "/members/" + addr + "/role", { role: newRole });
        loadMembers();
      } catch (err) {
        setS(function (prev) { return Object.assign({}, prev, { error: err.message || "Failed to change role" }); });
      }
    }, [boardSlug, loadMembers]);

    var roleBadge = function (role) {
      var variant = role === "admin" ? "default" : role === "editor" ? "secondary" : "outline";
      return h(Badge, { variant: variant, className: "text-xs" }, role);
    };

    return h(Card, null,
      h(CardHeader, null,
        h("div", { className: "flex items-center justify-between" },
          h(CardTitle, null, "Board Members"),
          h(Button, { variant: "outline", size: "sm", onClick: function () { if (props.onBack) props.onBack(); } }, "Back")
        ),
        h(CardDescription, null, "Manage who has access to this board.")
      ),
      h(CardContent, null,
        s.error ? h("div", { className: "mb-4 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive" }, s.error) : null,
        s.success ? h("div", { className: "mb-4 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400" }, s.success) : null,

        isAdmin ? h("div", { className: "flex gap-3 mb-6 items-end" },
          h("div", { className: "flex-1 space-y-2" },
            h(Label, null, "Wallet Address"),
            h(Input, { value: s.newAddr, placeholder: "osmo1... or terp1...", onChange: function (e) { setS(function (p) { return Object.assign({}, p, { newAddr: e.target.value }); }); } })
          ),
          h("div", { className: "w-32 space-y-2" },
            h(Label, null, "Role"),
            h(Select, Object.assign({ value: s.newRole, onValueChange: function (v) { setS(function (p) { return Object.assign({}, p, { newRole: v }); }); } }),
              h(SelectOption, { value: "viewer" }, "Viewer"),
              h(SelectOption, { value: "editor" }, "Editor")
            )
          ),
          h(Button, { onClick: handleAdd, disabled: !s.newAddr }, "Add")
        ) : null,

        s.loading ? h("p", { className: "text-sm text-muted-foreground" }, "Loading...") :
        h("div", { className: "space-y-2" },
          s.members.map(function (m) {
            return h("div", { key: m.wallet_addr, className: "flex items-center justify-between rounded-md border px-3 py-2" },
              h("div", { className: "flex items-center gap-3" },
                h("code", { className: "text-xs font-mono" }, truncateAddress(m.wallet_addr)),
                roleBadge(m.role)
              ),
              h("div", { className: "flex items-center gap-2" },
                isAdmin && m.role !== "admin"
                  ? h(Select, Object.assign({ value: m.role, onValueChange: function (v) { handleChangeRole(m.wallet_addr, v); } }),
                      h(SelectOption, { value: "viewer" }, "Viewer"),
                      h(SelectOption, { value: "editor" }, "Editor")
                    )
                  : null,
                isAdmin && m.role !== "admin"
                  ? h(Button, { variant: "destructive", size: "sm", onClick: function () { handleRemove(m.wallet_addr); } }, "Remove")
                  : null
              )
            );
          })
        ),

        !isAdmin ? h("p", { className: "text-sm text-muted-foreground text-center py-4" }, "Only the board admin can manage members.") : null
      )
    );
  }

  // -------------------------------------------------------------------------
  // Share Link Manager
  // -------------------------------------------------------------------------

  function ShareLinkManager(props) {
    var boardSlug = props.boardSlug;
    var myRole = props.myRole || "viewer";
    var canShare = myRole === "admin" || myRole === "editor";
    var state = useState({
      shares: [], loading: true, error: null, success: null,
      showCreate: false, newRole: "viewer", newExpiry: "14", createdToken: null,
    });
    var s = state[0];
    var setS = state[1];

    var loadShares = useCallback(function () {
      setS(function (prev) { return Object.assign({}, prev, { loading: true }); });
      walletApiGet("/shares", { board: boardSlug })
        .then(function (data) {
          setS(function (prev) { return Object.assign({}, prev, { shares: data.shares || [], loading: false }); });
        })
        .catch(function (err) {
          setS(function (prev) { return Object.assign({}, prev, { loading: false, error: err.message || "Failed to load shares" }); });
        });
    }, [boardSlug]);

    useEffect(function () { loadShares(); }, [loadShares]);

    var handleCreate = useCallback(async function () {
      setS(function (prev) { return Object.assign({}, prev, { error: null, success: null }); });
      try {
        var result = await walletApiPost("/shares", {
          board: boardSlug, role: s.newRole, expires_in_days: s.newExpiry,
        });
        setS(function (prev) {
          return Object.assign({}, prev, {
            createdToken: result.token,
            success: "Share link created! Copy the link below.",
          });
        });
        loadShares();
      } catch (err) {
        setS(function (prev) { return Object.assign({}, prev, { error: err.message || "Failed to create share" }); });
      }
    }, [s.newRole, s.newExpiry, boardSlug, loadShares]);

    var handleRevoke = useCallback(async function (shareId) {
      if (!confirm("Revoke this share link?")) return;
      try {
        await walletApiDelete("/shares/" + shareId);
        loadShares();
      } catch (err) {
        setS(function (prev) { return Object.assign({}, prev, { error: err.message || "Failed to revoke" }); });
      }
    }, [boardSlug, loadShares]);

    var copyLink = function (token) {
      var url = window.location.origin + "/share/" + token;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          setS(function (prev) { return Object.assign({}, prev, { success: "Link copied to clipboard!" }); });
        });
      }
    };

    var roleBadge = function (role) {
      var variant = role === "admin" ? "default" : role === "editor" ? "secondary" : "outline";
      return h(Badge, { variant: variant, className: "text-xs" }, role);
    };

    if (!canShare) {
      return h(Card, null,
        h(CardHeader, null,
          h("div", { className: "flex items-center justify-between" },
            h(CardTitle, null, "Share Links"),
            h(Button, { variant: "outline", size: "sm", onClick: function () { if (props.onBack) props.onBack(); } }, "Back")
          )
        ),
        h(CardContent, null,
          h("p", { className: "text-sm text-muted-foreground text-center py-6" }, "Only admins and editors can create share links.")
        )
      );
    }

    return h(Card, null,
      h(CardHeader, null,
        h("div", { className: "flex items-center justify-between" },
          h(CardTitle, null, "Share Links"),
          h(Button, { variant: "outline", size: "sm", onClick: function () { if (props.onBack) props.onBack(); } }, "Back")
        ),
        h(CardDescription, null, "Generate JWT links to share this board with others.")
      ),
      h(CardContent, null,
        s.error ? h("div", { className: "mb-4 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive" }, s.error) : null,
        s.success ? h("div", { className: "mb-4 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400" }, s.success) : null,

        s.createdToken ? h("div", { className: "mb-4 space-y-2" },
          h("p", { className: "text-sm text-muted-foreground" }, "Share link:"),
          h("div", { className: "flex gap-2" },
            h(Input, { readOnly: true, value: window.location.origin + "/share/" + s.createdToken, className: "font-mono text-xs" }),
            h(Button, { size: "sm", onClick: function () { copyLink(s.createdToken); } }, "Copy")
          )
        ) : null,

        h("div", { className: "mb-4" },
          h(Button, { variant: "outline", size: "sm", onClick: function () { setS(function (prev) { return Object.assign({}, prev, { showCreate: !prev.showCreate }); }); } },
            s.showCreate ? "Cancel" : "+ Create Share Link"
          ),
          s.showCreate ? h("div", { className: "mt-3 space-y-3 rounded-md border p-4" },
            h("div", { className: "grid grid-cols-2 gap-3" },
              h("div", { className: "space-y-2" },
                h(Label, null, "Role"),
                h(Select, Object.assign({ value: s.newRole, onValueChange: function (v) { setS(function (p) { return Object.assign({}, p, { newRole: v }); }); } }),
                  h(SelectOption, { value: "viewer" }, "Viewer (read-only)"),
                  h(SelectOption, { value: "editor" }, "Editor")
                )
              ),
              h("div", { className: "space-y-2" },
                h(Label, null, "Expires (days)"),
                h(Input, { type: "number", value: s.newExpiry, min: "1", max: "365", onChange: function (e) { setS(function (p) { return Object.assign({}, p, { newExpiry: e.target.value }); }); } })
              )
            ),
            h(Button, { className: "w-full", onClick: handleCreate }, "Generate Link")
          ) : null
        ),

        s.loading ? h("p", { className: "text-sm text-muted-foreground" }, "Loading...") :
        s.shares.length === 0 ? h("p", { className: "text-sm text-muted-foreground text-center py-4" }, "No share links created yet.") :
        h("div", { className: "space-y-2" },
          s.shares.map(function (share) {
            var now = Date.now() / 1000;
            var isExpired = share.expires_at < now;
            var statusText = share.is_revoked ? "Revoked" : isExpired ? "Expired" : "Active";
            var expiresText = isExpired ? "Expired" : share.expires_at ? new Date(share.expires_at * 1000).toLocaleDateString() : "Never";

            return h("div", { key: share.share_id, className: "flex items-center justify-between rounded-md border px-3 py-2" },
              h("div", { className: "flex items-center gap-3" },
                roleBadge(share.role),
                h("span", { className: "text-sm text-muted-foreground" }, expiresText),
                h("span", { className: "text-xs text-muted-foreground" }, share.use_count || 0, " uses")
              ),
              h("div", { className: "flex items-center gap-2" },
                h(Badge, { variant: share.is_revoked || isExpired ? "outline" : "default", className: "text-xs" }, statusText),
                !share.is_revoked && !isExpired
                  ? h(Button, { variant: "destructive", size: "sm", onClick: function () { handleRevoke(share.share_id); } }, "Revoke")
                  : null
              )
            );
          })
        )
      )
    );
  }

  // -------------------------------------------------------------------------
  // Terp Kanban Dashboard
  // -------------------------------------------------------------------------

  function TerpKanbanDashboard(props) {
    var state = useState({
      session: WalletSession.get(),
      view: "boards",
      boards: [],
      loading: true,
      error: null,
      currentBoard: null,
      currentBoardRole: null,
      showConnectModal: false,
    });
    var s = state[0];
    var setS = state[1];

    var loadBoards = useCallback(function () {
      setS(function (prev) { return Object.assign({}, prev, { loading: true }); });
      var endpoint = s.session ? "/wallet/boards" : "/wallet/boards/public";
      walletApiGet(endpoint)
        .then(function (data) {
          setS(function (prev) { return Object.assign({}, prev, { boards: data.boards || [], loading: false }); });
        })
        .catch(function (err) {
          setS(function (prev) { return Object.assign({}, prev, { loading: false, error: err.message || "Failed to load boards" }); });
        });
    }, [s.session]);

    useEffect(function () { loadBoards(); }, [loadBoards]);

    var handleConnected = useCallback(function (session) {
      setS(function (prev) { return Object.assign({}, prev, { session: session, showConnectModal: false }); });
      loadBoards();
    }, [loadBoards]);

    var handleLogout = useCallback(function () {
      WalletConnector.disconnect().catch(function () {});
      walletApiPost("/wallet/logout", {}).catch(function () {});
      WalletSession.clear();
      setS(function (prev) { return Object.assign({}, prev, { session: null, view: "boards", currentBoard: null }); });
      loadBoards();
    }, [loadBoards]);

    var handleOpenBoard = useCallback(function (slug) {
      setS(function (prev) { return Object.assign({}, prev, { view: "board-view", currentBoard: slug }); });
    }, []);

    var handleBack = useCallback(function () {
      setS(function (prev) { return Object.assign({}, prev, { view: "boards", currentBoard: null, currentBoardRole: null, error: null }); });
      loadBoards();
    }, [loadBoards]);

    var handleManageBoard = useCallback(function (slug) {
      var board = s.boards.find(function (b) { return b.slug === slug; });
      setS(function (prev) {
        return Object.assign({}, prev, {
          view: "members",
          currentBoard: slug,
          currentBoardRole: board ? board.my_role : "viewer",
        });
      });
    }, [s.boards]);

    var handleShareBoard = useCallback(function (slug, role) {
      setS(function (prev) {
        return Object.assign({}, prev, {
          view: "shares",
          currentBoard: slug,
          currentBoardRole: role,
        });
      });
    }, []);

    var isLoggedIn = !!s.session;

    // Board view — lightweight columns, no navbar
    if (s.view === "board-view" && s.currentBoard) {
      return h("div", { className: "h-full" },
        h("div", { className: "flex items-center gap-2 mb-4" },
          h(Button, { variant: "ghost", size: "sm", onClick: handleBack }, "\u2190 Back")
        ),
        h(LightweightBoardView, { boardSlug: s.currentBoard })
      );
    }

    return h("div", { className: "space-y-6" },
      // Header bar
      h("div", { className: "flex items-center justify-between" },
        h("div", { className: "flex items-center gap-3" },
          h("h2", { className: "text-lg font-semibold" }, "Terp Kanban"),
          isLoggedIn ? h(Badge, { variant: "default", className: "font-mono text-xs" },
            truncateAddress(s.session.wallet_addr)
          ) : null
        ),
        h("div", { className: "flex items-center gap-2" },
          isLoggedIn
            ? h(Button, { variant: "outline", size: "sm", onClick: handleLogout }, "Disconnect")
            : h(Button, { variant: "default", size: "sm", onClick: function () { setS(function (prev) { return Object.assign({}, prev, { showConnectModal: true }); }); } }, "Connect Wallet")
        )
      ),

      s.error ? h("div", { className: "rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive" }, s.error) : null,

      // Sub-views
      s.view === "create"
        ? h(CreateBoardForm, { onCreated: function () { setS(function (prev) { return Object.assign({}, prev, { view: "boards" }); }); loadBoards(); } })
        : s.view === "members" && s.currentBoard
          ? h(BoardMembersManager, { boardSlug: s.currentBoard, myRole: s.currentBoardRole, onBack: handleBack })
          : s.view === "shares" && s.currentBoard
            ? h(ShareLinkManager, { boardSlug: s.currentBoard, myRole: s.currentBoardRole, onBack: handleBack })
            : null,

      // Board list
      s.view === "boards" && (
        s.loading
          ? h("p", { className: "text-sm text-muted-foreground text-center py-8" }, "Loading boards...")
          : s.boards.length === 0
            ? h(Card, null,
                h(CardContent, { className: "py-8 text-center" },
                  h("p", { className: "text-sm text-muted-foreground mb-2" }, "No boards yet"),
                  h("p", { className: "text-xs text-muted-foreground" }, isLoggedIn ? "Connect your wallet and create your first board." : "Click Connect Wallet to create boards.")
                )
              )
            : h("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" },
                s.boards.map(function (board) {
                  var role = board.my_role;
                  var roleBadge = role === "admin" ? h(Badge, { variant: "default", className: "text-xs" }, "admin")
                    : role === "editor" ? h(Badge, { variant: "secondary", className: "text-xs" }, "editor")
                    : h(Badge, { variant: "outline", className: "text-xs" }, "viewer");

                  return h(Card, { key: board.slug, className: "cursor-pointer hover:border-ring/50 transition-colors" },
                    h(CardHeader, { className: "pb-2" },
                      h("div", { className: "flex items-start justify-between" },
                        h(CardTitle, { className: "text-sm" }, board.name || board.slug),
                        roleBadge
                      ),
                      board.description ? h(CardDescription, { className: "text-xs" }, board.description) : null
                    ),
                    h(CardContent, { className: "pt-0" },
                      h("div", { className: "flex gap-2" },
                        h(Button, { size: "sm", className: "flex-1", onClick: function () { handleOpenBoard(board.slug); } }, "Open"),
                        role === "admin"
                          ? h(Button, { variant: "outline", size: "sm", onClick: function () { handleManageBoard(board.slug); } }, "Manage")
                          : null,
                        (role === "admin" || role === "editor")
                          ? h(Button, { variant: "outline", size: "sm", onClick: function () { handleShareBoard(board.slug, role); } }, "Share")
                          : null
                      )
                    )
                  );
                })
              )
      ),

      // Create board button (only when logged in and on boards view)
      s.view === "boards" && isLoggedIn
        ? h(Button, { variant: "outline", size: "sm", onClick: function () { setS(function (prev) { return Object.assign({}, prev, { view: "create" }); }); } }, "+ Create Board")
        : null,

      // Connect modal
      s.showConnectModal
        ? h(WalletConnectModal, {
            onConnected: handleConnected,
            onClose: function () { setS(function (prev) { return Object.assign({}, prev, { showConnectModal: false }); }); },
          })
        : null
    );
  }

  // -------------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------------

  if (window.__HERMES_PLUGINS__ && typeof window.__HERMES_PLUGINS__.register === "function") {
    window.__HERMES_PLUGINS__.register("terp-kanban", TerpKanbanDashboard);
  }
})();
