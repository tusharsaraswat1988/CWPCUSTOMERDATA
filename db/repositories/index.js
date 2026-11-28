/**
 * Barrel export for all 18 BRD v1.0 database repositories
 */

'use strict';

module.exports = {
  adminUsers: require('./adminUsersRepo'),
  adminSecurity: require('./adminSecurityRepo'),
  authSessions: require('./authSessionsRepo'),
  auditLogs: require('./auditLogsRepo'),
  customers: require('./customersRepo'),
  serviceLocations: require('./serviceLocationsRepo'),
  vehicles: require('./vehiclesRepo'),
  solarInstallations: require('./solarInstallationsRepo'),
  staff: require('./staffRepo'),
  staffAuth: require('./staffAuthRepo'),
  catalog: require('./catalogRepo'),
  bookings: require('./bookingsRepo'),
  routes: require('./routesRepo'),
  dccDailyJobs: require('./dccDailyJobsRepo'),
  serviceJobs: require('./serviceJobsRepo'),
  staffTracking: require('./staffTrackingRepo'),
  jobApplications: require('./jobApplicationsRepo'),
  settings: require('./settingsRepo')
};
