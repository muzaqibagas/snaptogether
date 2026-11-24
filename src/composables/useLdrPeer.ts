import Peer, { type DataConnection, type MediaConnection } from 'peerjs';
import { onUnmounted, ref } from 'vue';
import type { LdrConnectionState, LdrSyncMessage } from '../types/booth';

const ROOM_PREFIX = 'snaptogether-ldr-';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SNAP-${code}`;
}

export function normalizeRoomCode(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cleaned) return '';
  return cleaned.startsWith('SNAP-') ? cleaned : `SNAP-${cleaned}`;
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: import.meta.env.VITE_TURN_USERNAME || undefined,
      credential: import.meta.env.VITE_TURN_CREDENTIAL || undefined,
    });
  }
  return servers;
}

export function useLdrPeer() {
  const connectionState = ref<LdrConnectionState>('idle');
  const roomCode = ref('');
  const isHost = ref(false);
  const errorMessage = ref<string | null>(null);
  const remoteStream = ref<MediaStream | null>(null);

  let peer: Peer | null = null;
  let dataConn: DataConnection | null = null;
  let mediaConn: MediaConnection | null = null;
  let localStreamRef: MediaStream | null = null;
  let partnerPeerId = '';
  const listeners = new Set<(msg: LdrSyncMessage) => void>();

  function emitMessage(msg: LdrSyncMessage) {
    listeners.forEach((cb) => cb(msg));
  }

  function onSyncMessage(cb: (msg: LdrSyncMessage) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function sendSyncMessage(msg: LdrSyncMessage) {
    if (dataConn && dataConn.open) {
      dataConn.send(msg);
    }
  }

  function bindDataConnection(conn: DataConnection) {
    if (dataConn && dataConn !== conn) {
      dataConn.close();
    }
    dataConn = conn;
    partnerPeerId = conn.peer;

    conn.on('open', () => {
      connectionState.value = 'connected';
      errorMessage.value = null;
      if (localStreamRef && peer) {
        initiateMediaCall(localStreamRef);
      }
    });

    conn.on('data', (raw) => {
      if (raw && typeof raw === 'object' && 'type' in raw) {
        emitMessage(raw as LdrSyncMessage);
      }
    });

    conn.on('close', () => {
      if (connectionState.value === 'connected') {
        connectionState.value = isHost.value ? 'waiting' : 'error';
        errorMessage.value = 'Koneksi pasangan terputus.';
        remoteStream.value = null;
      }
    });

    conn.on('error', () => {
      errorMessage.value = 'Gangguan jalur sinkronisasi data P2P.';
    });
  }

  function bindMediaConnection(call: MediaConnection) {
    if (mediaConn && mediaConn !== call) {
      mediaConn.close();
    }
    mediaConn = call;

    call.on('stream', (stream) => {
      remoteStream.value = stream;
    });

    call.on('close', () => {
      remoteStream.value = null;
    });
  }

  function initiateMediaCall(stream: MediaStream) {
    if (!peer || !partnerPeerId || peer.destroyed) return;
    try {
      const call = peer.call(partnerPeerId, stream);
      if (call) {
        bindMediaConnection(call);
      }
    } catch {
      // ignore if peer not ready yet
    }
  }

  function attachLocalStream(stream: MediaStream | null) {
    localStreamRef = stream;
    if (stream && connectionState.value === 'connected' && partnerPeerId) {
      initiateMediaCall(stream);
    }
  }

  function cleanupPeer() {
    dataConn?.close();
    mediaConn?.close();
    peer?.destroy();
    dataConn = null;
    mediaConn = null;
    peer = null;
    remoteStream.value = null;
    partnerPeerId = '';
    connectionState.value = 'idle';
    errorMessage.value = null;
  }

  function setupPeerInstance(customId?: string): Promise<Peer> {
    cleanupPeer();
    return new Promise((resolve, reject) => {
      const instance = customId
        ? new Peer(customId, { config: { iceServers: buildIceServers() } })
        : new Peer({ config: { iceServers: buildIceServers() } });

      peer = instance;

      instance.on('open', () => {
        resolve(instance);
      });

      instance.on('connection', (conn) => {
        bindDataConnection(conn);
      });

      instance.on('call', (call) => {
        call.answer(localStreamRef ?? undefined);
        bindMediaConnection(call);
      });

      instance.on('error', (err) => {
        const msg = err?.message || 'Koneksi PeerJS gagal.';
        errorMessage.value = msg.includes('ID')
          ? 'Kode ruangan sedang dipakai atau tidak ditemukan.'
          : msg;
        if (connectionState.value !== 'connected') {
          connectionState.value = 'error';
        }
        reject(err);
      });
    });
  }

  async function createHostRoom(desiredCode?: string): Promise<string> {
    isHost.value = true;
    connectionState.value = 'creating';
    errorMessage.value = null;

    const code = desiredCode ? normalizeRoomCode(desiredCode) : generateRoomCode();
    roomCode.value = code;

    try {
      await setupPeerInstance(`${ROOM_PREFIX}${code}`);
      connectionState.value = 'waiting';
      return code;
    } catch {
      connectionState.value = 'error';
      throw new Error(errorMessage.value || 'Gagal membuat ruang LDR.');
    }
  }

  async function joinGuestRoom(inputCode: string): Promise<void> {
    const normalized = normalizeRoomCode(inputCode);
    if (!normalized) {
      errorMessage.value = 'Masukkan Room Code yang valid (contoh: SNAP-4829).';
      return;
    }

    isHost.value = false;
    roomCode.value = normalized;
    connectionState.value = 'connecting';
    errorMessage.value = null;

    try {
      const guestPeer = await setupPeerInstance();
      const targetId = `${ROOM_PREFIX}${normalized}`;
      partnerPeerId = targetId;

      const conn = guestPeer.connect(targetId, { reliable: true });
      bindDataConnection(conn);
    } catch {
      connectionState.value = 'error';
    }
  }

  onUnmounted(() => {
    cleanupPeer();
  });

  return {
    connectionState,
    roomCode,
    isHost,
    errorMessage,
    remoteStream,
    createHostRoom,
    joinGuestRoom,
    attachLocalStream,
    sendSyncMessage,
    onSyncMessage,
    cleanupPeer,
  };
}
