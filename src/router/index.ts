import { createRouter, createWebHistory } from 'vue-router'
import PlannerView from '../views/PlannerView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // the layout kept in this browser
    {
      path: '/',
      name: 'planner',
      component: PlannerView,
    },
    {
      path: '/projects',
      name: 'projects',
      component: () => import('../views/ProjectsView.vue'),
    },
    // a cloud project, saving itself
    {
      path: '/project/:projectId',
      name: 'project',
      component: PlannerView,
      props: true,
    },
  ],
})

export default router
