<template>
  <div>
    <h1><styled>Bitcoin Price Tracker</styled></h1>
    <BitcoinChart />
  </div>
</template>

<script setup>
import BitcoinChart from '@/components/BitcoinChart.vue'
</script>


<style scoped>
h1 {
  text-align: center;
}
</style>