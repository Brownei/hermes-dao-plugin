import React, { useState, useEffect, useCallback, useRef } from "react";
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

const WC_PROJECT_ID = "2b7d5a2da89dd74fed821d184acabf95";
const SIGN_ARBITRARY_MSG =
  "Hi from Terp Kanban! This is a test message to prove the wallet is working.";
const TX_MEMO = "signed via cosmes";

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

interface PfpkProfile {
  name: string | null;
  nft: {
    imageUrl: string;
  } | null;
}

function getRpc(chain: string): string {
  switch (chain) {
    case "osmosis-1":
      return "https://rpc.osmosis.zone";
    case "juno-1":
      return "https://juno-rpc.polkachu.com";
    case "kaiyo-1":
      return "https://kujira-rpc.polkachu.com";
    case "phoenix-1":
      return "https://terra-rpc.publicnode.com";
    case "columbus-5":
      return "https://terra-classic-rpc.publicnode.com";
    case "neutron-1":
      return "https://neutron-rpc.polkachu.com";
    case "migaloo-1":
      return "https://migaloo-rpc.polkachu.com";
    case "injective-1":
      return "https://injective-rpc.polkachu.com";
    case "pacific-1":
      return "https://rpc-sei-ia.cosmosia.notional.ventures";
    case "dymension_1100-1":
      return "https://rpc.dymension.nodestake.org";
    case "terp-1":
      return "https://rpc.terp.network";
    case "Oraichain":
      return "https://rpc.orai.io";
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
    case "terp-1":
      return { amount: "0.001", denom: getDenom(chain) };
    case "Oraichain":
      return { amount: "0.003", denom: getDenom(chain) };
    default:
      throw new Error("Unknown chain");
  }
}

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
    case "terp-1":
      return "uterp";
    case "Oraichain":
      return "orai";
    default:
      throw new Error("Unknown chain");
  }
}

interface WalletConnectProps {
  onWalletChange?: (wallets: Record<string, ConnectedWallet>) => void;
  onAuthenticate?: () => void;
  isAuthenticated?: boolean;
  isAuthenticating?: boolean;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({
  onWalletChange,
  onAuthenticate,
  isAuthenticated = false,
  isAuthenticating = false,
}) => {
  const [selectedChain, setSelectedChain] = useState<string>("terp-1");
  const [selectedWallet, setSelectedWallet] = useState<WalletName>(WalletName.KEPLR);
  const [selectedType, setSelectedType] = useState<WalletType>(WalletType.EXTENSION);

  const [currentWallet, setCurrentWallet] = useState<ConnectedWallet | null>(null);
  const [currentChainId, setCurrentChainId] = useState<string | null>(null);
  const [walletController, setWalletController] = useState<WalletController | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const [profile, setProfile] = useState<PfpkProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [signing, setSigning] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const eventHandlersRegistered = useRef<Record<string, boolean>({});
  const currentWalletRef = useRef<ConnectedWallet | null>(null);

  useEffect(() => {
    currentWalletRef.current = currentWallet;
  }, [currentWallet]);

  useEffect(() => {
    Object.entries(CONTROLLERS).forEach(([walletName, controller]) => {
      if (eventHandlersRegistered.current[walletName]) return;

      controller.onDisconnect((disconnectedWallets) => {
        const chains = disconnectedWallets.map((w) => w.chainId);
        console.log("Wallet disconnected", {
          wallet: controller.id,
          chains,
        });

        if (currentWalletRef.current && chains.includes(currentWalletRef.current.chainId)) {
          setCurrentWallet(null);
          setCurrentChainId(null);
          setWalletController(null);
          setProfile(null);
        }
      });

      controller.onAccountChange((changedWallets) => {
        const chains = changedWallets.map((w) => w.chainId);
        console.log("Wallet account changed", {
          wallet: controller.id,
          chains,
        });

        if (chains.includes(selectedChain)) {
          connectWallet(selectedChain);
        }
      });

      eventHandlersRegistered.current[walletName] = true;
    });
  }, [selectedChain]);

  useEffect(() => {
    const address = currentWallet?.address;
    if (!address) {
      setProfile(null);
      return;
    }

    const fetchPfpkProfile = async () => {
      setLoadingProfile(true);
      try {
        const response = await fetch(`https://pfpk.daodao.zone/address/${address}`);
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Failed to fetch pfpk profile:", error);
        setProfile(null);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchPfpkProfile();
  }, [currentWallet]);

  useEffect(() => {
    if (currentWallet) {
      const wallets = { [currentWallet.chainId]: currentWallet };
      onWalletChange?.(wallets);
    } else {
      onWalletChange?.({});
    }
  }, [currentWallet, onWalletChange]);

  const connectWallet = useCallback(async (chainId: string): Promise<ConnectedWallet | null> => {
    setIsConnecting(true);
    try {
      let controller = walletController;
      if (!controller) {
        controller = CONTROLLERS[selectedWallet];
        setWalletController(controller);
      }

      const chainInfos = [{
        chainId,
        rpc: getRpc(chainId),
        gasPrice: getGasPrice(chainId),
      }];

      const wallets = await controller.connect(selectedType, chainInfos);
      const connectedWallet = wallets.get(chainId);

      if (!connectedWallet) {
        throw new Error(`No wallet found for chain: ${chainId}`);
      }

      setCurrentWallet(connectedWallet);
      setCurrentChainId(chainId);

      console.log("Wallet connected:", {
        address: connectedWallet.address,
        chainId: connectedWallet.chainId,
        wallet: connectedWallet.id,
      });

      return connectedWallet;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Wallet connection failed:", errorMessage);
      alert(`Failed to connect wallet: ${errorMessage}`);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, [selectedWallet, selectedType, walletController]);

  const disconnectWallet = useCallback(async () => {
    if (!walletController || !currentChainId) {
      alert("No wallet connected");
      return;
    }

    try {
      await walletController.disconnect([currentChainId]);
      setCurrentWallet(null);
      setCurrentChainId(null);
      setWalletController(null);
      setProfile(null);
      console.log("Wallet disconnected");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("Disconnect failed:", errorMessage);
      alert(`Failed to disconnect: ${errorMessage}`);
    }
  }, [walletController, currentChainId]);

  const signArbitrary = useCallback(async () => {
    if (!currentWallet) {
      alert("Wallet not connected yet");
      return;
    }

    setSigning(true);
    try {
      const res = await currentWallet.signArbitrary(SIGN_ARBITRARY_MSG);
      console.log("Sign result:", res);
      alert("Sign success! Check console logs for details.");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      alert(`Sign failed: ${errorMessage}`);
    } finally {
      setSigning(false);
    }
  }, [currentWallet]);

  const broadcastTx = useCallback(async () => {
    if (!currentWallet) {
      alert("Wallet not connected yet");
      return;
    }

    setBroadcasting(true);
    try {
      const tx: UnsignedTx = {
        msgs: [
          new MsgSend({
            fromAddress: currentWallet.address,
            toAddress: currentWallet.address,
            amount: [
              {
                denom: getDenom(selectedChain),
                amount: "1",
              },
            ],
          }),
        ],
        memo: TX_MEMO,
      };

      const fee = await currentWallet.estimateFee(tx);
      console.log("Tx fee:", fee);

      const txHash = await currentWallet.broadcastTx(tx, fee);
      console.log("Tx hash:", txHash);

      const { txResponse } = await currentWallet.pollTx(txHash);
      console.log("Tx response:", txResponse);

      alert(
        "Broadcast success!\n\nTx hash: " +
          txHash +
          "\n\nCheck console logs for details."
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      alert(`Broadcast failed: ${errorMessage}`);
    } finally {
      setBroadcasting(false);
    }
  }, [currentWallet, selectedChain]);

  const handleConnect = useCallback(() => {
    connectWallet(selectedChain);
  }, [connectWallet, selectedChain]);

  return (
    <div className="wallet-connect">
      {currentWallet ? (
        <div className="wallet-connected">
          <div className="wallet-profile">
            {profile?.nft?.imageUrl ? (
              <img
                src={profile.nft.imageUrl}
                alt="PFP"
                className="wallet-avatar"
              />
            ) : (
              <div className="wallet-avatar-placeholder">🚀</div>
            )}
            <div className="wallet-info">
              <span className="wallet-name">
                {loadingProfile ? 'Loading...' : (profile?.name || 'Anonymous Cosmonaut')}
              </span>
              <code className="wallet-address-display">{currentWallet.address}</code>
            </div>
          </div>
          <div className="wallet-actions">
            {!isAuthenticated && onAuthenticate && (
              <button
                className="wallet-btn auth"
                onClick={onAuthenticate}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? 'Authenticating...' : 'Authenticate with Hermes'}
              </button>
            )}
            {isAuthenticated && (
              <span className="auth-badge">✓ Authenticated</span>
            )}
            <button
              className="wallet-btn sign"
              onClick={signArbitrary}
              disabled={signing}
            >
              {signing ? 'Signing...' : 'Sign Message'}
            </button>
            <button
              className="wallet-btn broadcast"
              onClick={broadcastTx}
              disabled={broadcasting}
            >
              {broadcasting ? 'Broadcasting...' : 'Broadcast Test Tx'}
            </button>
            <button
              className="wallet-btn disconnect"
              onClick={disconnectWallet}
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="wallet-disconnected">
          <div className="wallet-controls">
            <select
              className="wallet-select"
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
            >
              {Object.keys(CHAINS).map((id) => (
                <option key={id} value={id}>{CHAINS[id]}</option>
              ))}
            </select>

            <select
              className="wallet-select"
              value={selectedWallet}
              onChange={(e) => setSelectedWallet(e.target.value as WalletName)}
            >
              {Object.keys(WALLETS).map((walletName) => (
                <option key={walletName} value={walletName}>
                  {WALLETS[walletName as WalletName]}
                </option>
              ))}
            </select>

            <select
              className="wallet-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as WalletType)}
            >
              {Object.keys(TYPES).map((typeKey) => (
                <option key={typeKey} value={typeKey}>
                  {TYPES[typeKey as WalletType]}
                </option>
              ))}
            </select>
          </div>

          <button
            className="wallet-btn connect"
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        </div>
      )}
    </div>
  );
};