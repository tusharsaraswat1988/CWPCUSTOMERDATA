/**
 * Barrel export for all 15 database repositories
 */
module.exports = {
  adminUsers: require('./adminUsersRepo'),
  staff: require('./staffRepo'),
  staffAuth: require('./staffAuthRepo'),
  authSessions: require('./authSessionsRepo'),
  customers: require('./customersRepo'),
  vehicles: require('./vehiclesRepo'),
  serviceLocations: require('./serviceLocationsRepo'),
  serviceCategories: require('./serviceCategoriesRepo'),
  subscriptions: require('./subscriptionsRepo'),
  subscriptionVehicles: require('./subscriptionVehiclesRepo'),
  staffAssignments: require('./staffAssignmentsRepo'),
  staffRouteSequences: require('./staffRouteSequencesRepo'),
  serviceJobs: require('./serviceJobsRepo'),
  serviceLogs: require('./serviceLogsRepo'),
  auditLogs: require('./auditLogsRepo'),
  staffTracking: require('./staffTrackingRepo')
};
