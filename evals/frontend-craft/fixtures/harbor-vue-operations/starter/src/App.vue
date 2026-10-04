<script setup lang="ts">
import { computed, ref } from "vue";
import { jobs, type Job, type Status } from "./jobs";

const query = ref("");
const status = ref<Status | "All">("All");
const ascending = ref(true);
const selected = ref<Job | null>(null);
const visibleJobs = computed(() =>
  jobs
    .filter((job) => status.value === "All" || job.status === status.value)
    .filter((job) =>
      `${job.id} ${job.customer} ${job.destination}`
        .toLowerCase()
        .includes(query.value.trim().toLowerCase())
    )
    .sort((a, b) => (ascending.value ? a.due.localeCompare(b.due) : b.due.localeCompare(a.due)))
);
const atRisk = jobs.filter((job) => job.status === "At risk").length;
const ready = jobs.filter((job) => job.status === "Ready").length;
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">Harbor<span>Dispatch workspace</span></div>
      <nav aria-label="Workspace"><a href="#dispatch" aria-current="page">Dispatch board</a></nav>
      <p>Hamilton depot<br />Afternoon shift</p>
    </aside>
    <div class="workspace">
      <header><span>Operations / Dispatch</span><span>October 6, 2026 · 13:30</span></header>
      <main id="dispatch">
        <div class="heading">
          <div>
            <h1>Dispatch board</h1>
            <p>Keep the afternoon handoff moving.</p>
          </div>
          <span class="cutoff">Next cutoff 14:00</span>
        </div>
        <div class="metrics">
          <div>
            <strong>{{ jobs.length }}</strong> jobs today
          </div>
          <div>
            <strong>{{ atRisk }}</strong> at risk
          </div>
          <div>
            <strong>{{ ready }}</strong> ready for handoff
          </div>
        </div>
        <section class="board" aria-label="Dispatch jobs">
          <div class="toolbar">
            <input v-model="query" aria-label="Search jobs" placeholder="Search jobs" /><select
              v-model="status"
              aria-label="Filter by status"
            >
              <option>All</option>
              <option>At risk</option>
              <option>In progress</option>
              <option>Ready</option></select
            ><span>{{ visibleJobs.length }} jobs</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Destination</th>
                <th>Owner</th>
                <th>Parcels</th>
                <th>
                  <button @click="ascending = !ascending">Due {{ ascending ? "↑" : "↓" }}</button>
                </th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="job in visibleJobs"
                :key="job.id"
                :class="{ selected: selected?.id === job.id }"
              >
                <td>{{ job.id }}</td>
                <td>{{ job.customer }}</td>
                <td>{{ job.destination }}</td>
                <td>{{ job.owner }}</td>
                <td>{{ job.parcels }}</td>
                <td>{{ job.due }}</td>
                <td>
                  <span class="status">{{ job.status }}</span>
                </td>
                <td><button @click="selected = job">View</button></td>
              </tr>
            </tbody>
          </table>
          <p v-if="!visibleJobs.length" class="empty">No jobs found.</p>
        </section>
        <section v-if="selected" class="details" aria-label="Job details">
          <button @click="selected = null">Close</button>
          <h2>{{ selected.id }} · {{ selected.customer }}</h2>
          <p>
            {{ selected.destination }} · {{ selected.parcels }} parcels · Due {{ selected.due }}
          </p>
          <p>Owner: {{ selected.owner }} · {{ selected.status }}</p>
          <h3>Handoff note</h3>
          <p>{{ selected.note }}</p>
        </section>
      </main>
      <footer>Local dispatch preview · Changes do not affect live deliveries</footer>
    </div>
  </div>
</template>
