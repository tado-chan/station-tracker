Pod::Spec.new do |s|
  s.name = 'StationTrackerGeolocation'
  s.version = '1.0.0'
  s.summary = 'Native geolocation plugin for Station Tracker with offline queue and reliability'
  s.license = 'MIT'
  s.homepage = 'https://github.com/station-tracker'
  s.author = 'Station Tracker Team'
  s.source = { :git => 'https://github.com/station-tracker', :tag => s.version.to_s }
  s.source_files = 'ios/Plugin/**/*.{swift,h,m,c,cc,mm,cpp}'
  s.ios.deployment_target  = '13.0'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
