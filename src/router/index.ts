import { createRouter, createWebHistory } from 'vue-router'
import PlannerView from '../views/PlannerView.vue'
import { sharedProjectId } from '@/cloud/projects'
import { isUuid } from '@/venue/layout'

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
    // a cloud project, saving itself: its link, carrying the share token while sharing is on
    {
      path: '/project/:projectId',
      name: 'project',
      component: PlannerView,
      props: (to) => ({
        projectId: to.params.projectId,
        shareToken: isUuid(to.query.share) ? to.query.share : undefined,
      }),
    },
    // an old share link: on to the project's own link when it lets them in, else saying why
    {
      path: '/share/:shareToken',
      name: 'share',
      component: PlannerView,
      props: true,
      beforeEnter: async (to) => {
        const token = String(to.params.shareToken)
        try {
          const id = await sharedProjectId(token)
          if (id) return { name: 'project', params: { projectId: id }, query: { share: token } }
        } catch {
          // opened here instead, which says what went wrong
        }
        return true
      },
    },
  ],
})

export default router
