import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { debounce } from 'lodash'; // Install lodash if not already installed
import { format } from 'date-fns';
import WorklistTable from './WorklistTable';

const WorklistSearch = React.memo(({ 
  allStudies = [], 
  loading = false, 
  totalRecords = 0, 
  currentPage = 1, 
  totalPages = 1, 
  onPageChange,
  userRole = 'admin',
  onAssignmentComplete
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchType, setSearchType] = useState("");
  const [quickSearchTerm, setQuickSearchTerm] = useState("");
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  
  // Basic filters for advanced search
  const [patientName, setPatientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [accessionNumber, setAccessionNumber] = useState('');
  const [description, setDescription] = useState('');

  // 🔧 MEMOIZE LOCATIONS
  const locations = useMemo(() => {
    const uniqueLocations = [...new Set(allStudies.filter(s => s.location).map(s => s.location))];
    return uniqueLocations.map(loc => ({ id: loc, name: loc }));
  }, [allStudies]);

  // 🔧 MEMOIZE FILTERED STUDIES - CRITICAL OPTIMIZATION
  const filteredStudies = useMemo(() => {
    let filtered = [...allStudies];

    // Quick search
    if (quickSearchTerm.trim()) {
      const searchTerm = quickSearchTerm.toLowerCase();
      filtered = filtered.filter(study => {
        const name = (study.patientName || '').toLowerCase();
        const id = (study.patientId || '').toLowerCase();
        const accession = (study.accessionNumber || '').toLowerCase();

        if (searchType === 'patientName') {
          return name.includes(searchTerm);
        } else if (searchType === 'patientId') {
          return id.includes(searchTerm);
        } else if (searchType === 'accession') {
          return accession.includes(searchTerm);
        } else {
          return name.includes(searchTerm) || id.includes(searchTerm) || accession.includes(searchTerm);
        }
      });
    }

    // Location filter
    if (selectedLocation !== 'ALL') {
      filtered = filtered.filter(study => study.location === selectedLocation);
    }

    // Advanced search filters
    if (patientName.trim()) {
      filtered = filtered.filter(study => 
        (study.patientName || '').toLowerCase().includes(patientName.toLowerCase())
      );
    }

    if (patientId.trim()) {
      filtered = filtered.filter(study => 
        (study.patientId || '').toLowerCase().includes(patientId.toLowerCase())
      );
    }

    if (accessionNumber.trim()) {
      filtered = filtered.filter(study => 
        (study.accessionNumber || '').toLowerCase().includes(accessionNumber.toLowerCase())
      );
    }

    if (description.trim()) {
      filtered = filtered.filter(study => 
        (study.description || '').toLowerCase().includes(description.toLowerCase())
      );
    }

    return filtered;
  }, [allStudies, quickSearchTerm, searchType, selectedLocation, patientName, patientId, accessionNumber, description]);

  // 🔧 DEBOUNCED SEARCH
  const debouncedSetQuickSearchTerm = useMemo(
    () => debounce((value) => {
      setQuickSearchTerm(value);
    }, 300),
    []
  );

  // 🔧 MEMOIZED CALLBACKS
  const handleQuickSearch = useCallback((e) => {
    e.preventDefault();
    // Search happens automatically via memoized filteredStudies
  }, []);

  const handleClear = useCallback(() => {
    setQuickSearchTerm('');
    setSearchType('');
    setSelectedLocation('ALL');
    setPatientName('');
    setPatientId('');
    setAccessionNumber('');
    setDescription('');
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  // 🔧 MEMOIZE ACTIVE FILTERS CHECK
  const hasActiveFilters = useMemo(() => {
    return quickSearchTerm || patientName || patientId || accessionNumber || description || selectedLocation !== 'ALL';
  }, [quickSearchTerm, patientName, patientId, accessionNumber, description, selectedLocation]);

  return (
    <div className="space-y-6">
      {/* Enhanced Search Controls */}
      <div className="relative">
        {/* Main Search Header */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 shadow-sm">
          {hasActiveFilters && (
            <div className="flex items-center space-x-2 mb-4">
              <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                {filteredStudies.length} results
              </span>
              <button
                onClick={handleClear}
                className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full hover:bg-red-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          )}

          {/* Top Search Bar */}
          <div className="flex items-center space-x-3 flex-wrap gap-y-2">
            {/* Search Type Selector */}
            <div className="relative">
              <select 
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
              >
                <option value="">🔍 All Fields</option>
                <option value="patientName">👤 Patient Name</option>
                <option value="patientId">🆔 Patient ID</option>
                <option value="accession">📋 Accession</option>
              </select>
            </div>
            
            {/* Search Input */}
            <form onSubmit={handleQuickSearch} className="flex-1 min-w-64">
              <div className="relative">
                <input
                  type="text"
                  placeholder="🔍 Search by Patient ID, Name, or Accession..."
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 pr-12 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  onChange={(e) => debouncedSetQuickSearchTerm(e.target.value)}
                />
                <button 
                  type="submit" 
                  className="absolute right-1 top-1 bottom-1 px-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            </form>
            
            {/* Location Filter */}
            <div className="relative">
              <select 
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 text-sm font-medium text-gray-700 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all min-w-48"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
              >
                <option value="ALL">🏥 All Locations</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>📍 {loc.name}</option>
                ))}
              </select>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-2">
              <button 
                className={`p-2 border rounded-lg transition-all ${
                  isExpanded 
                    ? 'bg-blue-500 border-blue-500 text-white shadow-md' 
                    : 'bg-white border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-400'
                }`}
                onClick={toggleExpanded}
                title="Advanced Search"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Advanced Search Panel - Only render when expanded */}
        {isExpanded && (
          <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-xl shadow-xl">
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4 border-b border-gray-200 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">Advanced Search Options</h3>
                <button onClick={toggleExpanded} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Patient Name */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-gray-700">
                    Patient Name
                  </label>
                  <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Enter patient name..."
                  />
                </div>

                {/* Patient ID */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-gray-700">
                    Patient ID
                  </label>
                  <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                    placeholder="Enter patient ID..."
                  />
                </div>

                {/* Accession Number */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-gray-700">
                    Accession Number
                  </label>
                  <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    value={accessionNumber}
                    onChange={(e) => setAccessionNumber(e.target.value)}
                    placeholder="Enter accession number..."
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-gray-700">
                    Study Description
                  </label>
                  <input
                    type="text"
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter study description..."
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center border-t border-gray-200 p-4 bg-gray-50 rounded-b-xl">
              <div className="text-sm text-gray-600">
                {hasActiveFilters ? `${filteredStudies.length} studies match your criteria` : 'No filters applied'}
              </div>
              <div className="flex space-x-3">
                <button onClick={handleClear} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium">
                  Reset All
                </button>
                <button onClick={toggleExpanded} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm">
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pass filtered data to WorklistTable */}
      <WorklistTable 
        studies={filteredStudies}
        loading={loading}
        totalRecords={filteredStudies.length}
        currentPage={currentPage}
        totalPages={Math.ceil(filteredStudies.length / 10)}
        onPageChange={onPageChange}
        userRole={userRole}
        onAssignmentComplete={onAssignmentComplete}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.allStudies.length === nextProps.allStudies.length &&
    prevProps.loading === nextProps.loading &&
    JSON.stringify(prevProps.allStudies) === JSON.stringify(nextProps.allStudies)
  );
});

export default WorklistSearch;