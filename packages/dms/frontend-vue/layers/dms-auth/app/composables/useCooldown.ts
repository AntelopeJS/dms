const COOLDOWN_INTERVAL_MS = 1000;

export function useCooldown(duration: number) {
  const cooldown = ref<number>(duration);
  const cooldownInterval = ref<ReturnType<typeof setInterval>>();

  function startCooldown() {
    cooldown.value = duration;

    if (cooldownInterval.value) {
      clearInterval(cooldownInterval.value);
    }

    cooldownInterval.value = setInterval(() => {
      cooldown.value--;
      if (cooldown.value <= 0) {
        clearInterval(cooldownInterval.value);
      }
    }, COOLDOWN_INTERVAL_MS);
  }

  return { cooldown, startCooldown };
}
