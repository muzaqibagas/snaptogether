<script setup lang="ts">
import { Clock, Heart, RotateCcw, Volume2, VolumeX } from 'lucide-vue-next';
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
  { id: 1, label: 'Pilih Frame', shortLabel: 'Frame' },
  { id: 2, label: 'Foto Bareng', shortLabel: 'Foto' },
  { id: 3, label: 'Hasil & QR', shortLabel: 'Hasil' },
] as const;
</script>

<template>
  <header
    class="safe-top sticky top-0 z-40 border-b-2 border-[#f4ceda] bg-[#fffaf8]/95 pb-2.5 backdrop-blur-md"
  >
    <div class="safe-x mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 sm:gap-3">
      <!-- Cute Brand Badge -->
      <div class="flex min-w-0 items-center gap-2.5">
        <div
          class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[#f6b8cc] bg-[#ffe7ef] shadow-[0_3px_0_#f7cad8] sm:h-11 sm:w-11"
        >
          <!-- Handcrafted Blushing Camera SVG -->
          <svg viewBox="0 0 36 36" class="h-7 w-7" aria-hidden="true">
            <rect x="11" y="5" width="14" height="5" rx="2.5" fill="#f05483" />
            <rect x="4" y="9" width="28" height="21" rx="7" fill="#f05483" />
            <circle cx="18" cy="19.5" r="7" fill="#fff9fb" />
            <path
              d="M18 23.1c-.3 0-3.8-2.3-3.8-4.6 0-1.2.9-2.1 2-2.1.7 0 1.4.4 1.8 1 .4-.6 1.1-1 1.8-1 1.1 0 2 .9 2 2.1 0 2.3-3.5 4.6-3.8 4.6z"
              fill="#f05483"
            />
            <circle cx="26.5" cy="14" r="1.7" fill="#ffe699" />
            <ellipse cx="9" cy="23.5" rx="1.8" ry="1" fill="#ff9ebb" />
            <ellipse cx="27" cy="23.5" rx="1.8" ry="1" fill="#ff9ebb" />
          </svg>
        </div>

        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-display truncate text-base font-bold tracking-tight text-[#3b212a] sm:text-lg">
              SnapTogether
            </span>
            <Heart class="h-3.5 w-3.5 shrink-0 fill-[#f05483] text-[#f05483]" />
            <span
              v-if="mode === 'ldr'"
              class="hidden items-center gap-1 rounded-full border border-[#a9d5fa] bg-[#e9f5ff] px-2 py-0.5 text-[11px] font-bold text-[#2566a3] sm:inline-flex"
            >
              LDR {{ ldrState === 'connected' ? '• Tersambung' : '' }}
            </span>
          </div>
          <p class="hidden text-[11px] font-medium text-[#8a6572] sm:block">
            Photobooth gemes buat berdua • Solo &amp; LDR
          </p>
        </div>
      </div>

      <!-- 3-Step Compact Pill Stepper -->
      <nav
        aria-label="Alur Photobooth"
        class="order-3 flex w-full items-center justify-center gap-1 sm:gap-1.5 md:order-2 md:w-auto"
      >
        <div
          v-for="(step, idx) in steps"
          :key="step.id"
          class="flex items-center gap-1 sm:gap-1.5"
        >
          <div
            class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all sm:px-3 sm:text-xs"
            :class="
              currentStep === step.id
                ? 'border-[#e04877] bg-[#f05483] text-white shadow-[0_2px_0_#c63360]'
                : currentStep > step.id
                  ? 'border-[#9ce0be] bg-[#e8faf0] text-[#17794d]'
                  : 'border-[#f3d4de] bg-[#fff5f7] text-[#9b7684]'
            "
          >
            <span
              class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-extrabold"
              :class="
                currentStep === step.id
                  ? 'bg-white text-[#e44374]'
                  : currentStep > step.id
                    ? 'bg-[#24b47e] text-white'
                    : 'bg-[#fae3eb] text-[#9b7684]'
              "
            >
              {{ currentStep > step.id ? '✓' : step.id }}
            </span>
            <span class="sm:hidden">{{ step.shortLabel }}</span>
            <span class="hidden sm:inline">{{ step.label }}</span>
          </div>
          <span v-if="idx < steps.length - 1" class="text-xs font-bold text-[#e2b6c4]">♥</span>
        </div>
      </nav>

      <!-- Timer & Quick Actions -->
      <div class="order-2 flex items-center gap-1.5 sm:gap-2 md:order-3">
        <div
          class="flex h-9 items-center gap-1.5 rounded-xl border-2 px-2.5 transition-colors sm:h-10 sm:gap-2 sm:px-3"
          :class="
            isCritical
              ? 'animate-pulse border-[#f28fa8] bg-[#ffe7ee] text-[#b91c49]'
              : isWarning
                ? 'border-[#f4ca78] bg-[#fff5d8] text-[#945804]'
                : isTimerActive
                  ? 'border-[#9be0c0] bg-[#e9fbf1] text-[#147449]'
                  : 'border-[#f3d3de] bg-white text-[#5d3d49]'
          "
          :title="isTimerActive ? 'Sisa waktu sesi aktif' : 'Timer 10 menit mulai otomatis saat jepretan pertama'"
        >
          <Clock class="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
          <div class="leading-tight">
            <div class="font-mono-timer text-xs font-bold sm:text-sm">{{ formattedTime }}</div>
            <div class="hidden text-[10px] font-medium opacity-80 lg:block">
              {{ isTimerActive ? 'Sesi Berjalan' : 'Siap (10 Menit)' }}
            </div>
          </div>
        </div>

        <button
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#f3d3de] bg-white text-[#6a4452] transition hover:border-[#ebafc2] hover:bg-[#fff0f4] sm:h-10 sm:w-10"
          :title="isMuted ? 'Nyalakan suara shutter' : 'Bisukan suara shutter'"
          :aria-label="isMuted ? 'Nyalakan suara shutter' : 'Bisukan suara shutter'"
          @click="$emit('toggleMute')"
        >
          <VolumeX v-if="isMuted" class="h-4 w-4 text-[#b37e90]" />
          <Volume2 v-else class="h-4 w-4 text-[#e44374]" />
        </button>

        <button
          v-if="currentStep > 1"
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-xl border-2 border-[#f3d3de] bg-white px-2.5 text-xs font-bold text-[#6a4452] transition hover:border-[#f097b1] hover:bg-[#fff0f4] hover:text-[#c63360] sm:h-10 sm:px-3"
          title="Ulang sesi kembali ke Langkah 1"
          @click="$emit('reset')"
        >
          <RotateCcw class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Ulang</span>
        </button>
      </div>
    </div>
  </header>
</template>
