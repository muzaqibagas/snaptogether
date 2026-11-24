<script setup lang="ts">
import { Camera, Clock, RotateCcw, Users, Volume2, VolumeX } from 'lucide-vue-next';
import type { BoothMode, LdrConnectionState } from '../types/booth';

defineProps<{
  currentStep: 1 | 2 | 3;
  mode: BoothMode;
  formattedTime: string;
  isTimerActive: boolean;
  isWarning: boolean;
  isCritical: boolean;
  isMuted: boolean;
  ldrState: LdrConnectionState;
}>();

defineEmits<{
  (e: 'toggleMute'): void;
  (e: 'reset'): void;
}>();

const steps = [
  { id: 1, label: 'Pilih Bingkai' },
  { id: 2, label: 'Sesi Foto' },
  { id: 3, label: 'Hasil & QR' },
] as const;
</script>

<template>
  <header class="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
    <div class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
      <!-- Brand -->
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 via-rose-500 to-violet-600 shadow-lg shadow-pink-500/25"
        >
          <Camera class="h-5 w-5 text-white" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="font-display text-lg font-bold tracking-tight text-white">SnapTogether</span>
            <span
              v-if="mode === 'ldr'"
              class="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-300"
            >
              <Users class="h-3 w-3" />
              LDR {{ ldrState === 'connected' ? '• Tersambung' : '' }}
            </span>
          </div>
          <p class="hidden text-xs text-slate-400 sm:block">Web & LDR Duo Photobooth</p>
        </div>
      </div>

      <!-- 3-Step Indicator -->
      <nav aria-label="Alur Photobooth" class="order-3 flex w-full items-center justify-center gap-1.5 sm:order-2 sm:w-auto">
        <div
          v-for="(step, idx) in steps"
          :key="step.id"
          class="flex items-center gap-1.5"
        >
          <div
            class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all"
            :class="
              currentStep === step.id
                ? 'bg-pink-500 text-white shadow-md shadow-pink-500/30'
                : currentStep > step.id
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
            "
          >
            <span
              class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
              :class="
                currentStep === step.id
                  ? 'bg-white text-pink-600'
                  : currentStep > step.id
                    ? 'bg-emerald-400 text-slate-950'
                    : 'bg-slate-800 text-slate-400'
              "
            >
              {{ currentStep > step.id ? '✓' : step.id }}
            </span>
            <span>{{ step.label }}</span>
          </div>
          <span v-if="idx < steps.length - 1" class="text-slate-700">→</span>
        </div>
      </nav>

      <!-- Timer & Quick Actions -->
      <div class="order-2 flex items-center gap-2 sm:order-3">
        <div
          class="flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors"
          :class="
            isCritical
              ? 'animate-pulse border-rose-500/60 bg-rose-500/15 text-rose-300'
              : isWarning
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                : isTimerActive
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-800 bg-slate-900/90 text-slate-300'
          "
          :title="isTimerActive ? 'Sisa waktu sesi aktif' : 'Timer 10 menit dimulai otomatis saat jepretan pertama'"
        >
          <Clock class="h-4 w-4 shrink-0" />
          <div class="leading-tight">
            <div class="font-mono-timer text-sm font-bold">{{ formattedTime }}</div>
            <div class="hidden text-[10px] opacity-80 md:block">
              {{ isTimerActive ? 'Sesi Berjalan' : 'Siap (10 Menit)' }}
            </div>
          </div>
        </div>

        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 transition hover:border-slate-700 hover:bg-slate-800 hover:text-white"
          :title="isMuted ? 'Nyalakan suara shutter' : 'Bisukan suara shutter'"
          @click="$emit('toggleMute')"
        >
          <VolumeX v-if="isMuted" class="h-4 w-4" />
          <Volume2 v-else class="h-4 w-4" />
        </button>

        <button
          v-if="currentStep > 1"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
          title="Reset sesi kembali ke Langkah 1"
          @click="$emit('reset')"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Reset</span>
        </button>
      </div>
    </div>
  </header>
</template>
