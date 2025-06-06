// 🔧 FIXED: ShareButton.jsx - Centered modal instead of dropdown
import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const ShareButton = ({ study }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareLinks, setShareLinks] = useState({});
  const modalRef = useRef(null);

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Generate shareable link
  const generateShareableLink = async (viewerType) => {
    try {
      setIsGenerating(true);
      
      const response = await api.post('/sharing/generate-link', {
        studyId: study._id,
        studyInstanceUID: study.studyInstanceUID || study.instanceID,
        orthancStudyID: study.orthancStudyID,
        viewerType: viewerType,
        patientName: study.patientName,
        studyDescription: study.description,
        modality: study.modality,
        studyDate: study.studyDate,
        expiresIn: '7d'
      });

      if (response.data.success) {
        const shareableLink = response.data.shareableLink;
        
        setShareLinks(prev => ({
          ...prev,
          [viewerType]: shareableLink
        }));

        return shareableLink;
      } else {
        throw new Error(response.data.message || 'Failed to generate shareable link');
      }
    } catch (error) {
      console.error('Error generating shareable link:', error);
      toast.error('Failed to generate shareable link');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  // Copy link to clipboard
  const copyToClipboard = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard!', {
        icon: '📋',
        duration: 2000
      });
    } catch (error) {
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      toast.success('Link copied to clipboard!', {
        icon: '📋',
        duration: 2000
      });
    }
  };

  // Generate QR Code
  const generateQRCode = async (link) => {
    try {
      const qrResponse = await api.post('/sharing/generate-qr', {
        url: link,
        studyInfo: {
          patientName: study.patientName,
          patientId: study.patientId,
          modality: study.modality
        }
      });

      if (qrResponse.data.success) {
        const qrWindow = window.open('', '_blank', 'width=400,height=500');
        qrWindow.document.write(`
          <html>
            <head>
              <title>QR Code - ${study.patientName}</title>
              <style>
                body { 
                  font-family: Arial, sans-serif; 
                  text-align: center; 
                  padding: 20px; 
                  background: #f5f5f5;
                }
                .qr-container {
                  background: white;
                  border-radius: 10px;
                  padding: 20px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                  max-width: 350px;
                  margin: 0 auto;
                }
                .qr-code {
                  margin: 20px 0;
                }
                .study-info {
                  background: #f8f9fa;
                  padding: 15px;
                  border-radius: 8px;
                  margin-top: 20px;
                  text-align: left;
                }
                .study-info h3 {
                  margin: 0 0 10px 0;
                  color: #333;
                }
                .study-info p {
                  margin: 5px 0;
                  color: #666;
                  font-size: 14px;
                }
              </style>
            </head>
            <body>
              <div class="qr-container">
                <h2>📱 Scan to View Study</h2>
                <div class="qr-code">
                  <img src="${qrResponse.data.qrCodeDataURL}" alt="QR Code" style="max-width: 100%;" />
                </div>
                <div class="study-info">
                  <h3>📋 Study Information</h3>
                  <p><strong>Patient:</strong> ${study.patientName}</p>
                  <p><strong>Patient ID:</strong> ${study.patientId}</p>
                  <p><strong>Modality:</strong> ${study.modality}</p>
                  <p><strong>Description:</strong> ${study.description}</p>
                  <p><strong>Study Date:</strong> ${new Date(study.studyDate).toLocaleDateString()}</p>
                </div>
                <p style="font-size: 12px; color: #888; margin-top: 20px;">
                  🔒 This link expires in 7 days for security
                </p>
              </div>
            </body>
          </html>
        `);
        qrWindow.document.close();
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast.error('Failed to generate QR code');
    }
  };

  // Share via Web Share API (mobile)
  const shareViaWebAPI = async (link, viewerType) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `DICOM Study - ${study.patientName}`,
          text: `View ${study.patientName}'s ${study.modality} study using ${viewerType}`,
          url: link
        });
        toast.success('Shared successfully!');
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error sharing:', error);
          copyToClipboard(link);
        }
      }
    } else {
      copyToClipboard(link);
    }
  };

  // Handle share action
  const handleShare = async (viewerType, action) => {
    let link = shareLinks[viewerType];
    
    if (!link) {
      link = await generateShareableLink(viewerType);
      if (!link) return;
    }

    switch (action) {
      case 'copy':
        await copyToClipboard(link);
        break;
      case 'qr':
        await generateQRCode(link);
        break;
      case 'share':
        await shareViaWebAPI(link, viewerType);
        break;
      case 'email':
        const subject = encodeURIComponent(`DICOM Study - ${study.patientName}`);
        const body = encodeURIComponent(`View ${study.patientName}'s ${study.modality} study:\n\n${link}\n\nThis link expires in 7 days.`);
        window.open(`mailto:?subject=${subject}&body=${body}`);
        break;
      default:
        break;
    }
    
    // Don't close modal immediately for better UX
    if (action !== 'copy') {
      setTimeout(() => setIsOpen(false), 1000);
    }
  };

  const shareOptions = [
    {
      viewerType: 'ohif-local',
      name: 'OHIF Viewer (Local)',
      icon: '🏠',
      description: 'Self-hosted OHIF viewer',
      color: 'blue'
    },
    {
      viewerType: 'ohif-cloud',
      name: 'OHIF Viewer (Cloud)',
      icon: '☁️',
      description: 'Public viewer.ohif.org',
      color: 'sky'
    },
    {
      viewerType: 'stone-viewer',
      name: 'Stone Web Viewer',
      icon: '🗿',
      description: 'Orthanc built-in viewer',
      color: 'gray'
    }
  ];

  return (
    <>
      {/* Share Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className="text-purple-600 hover:text-purple-800 transition-colors duration-200 p-1 hover:bg-purple-50 rounded"
        title="Share study with others"
        disabled={isGenerating}
      >
        {isGenerating ? (
          <div className="animate-spin h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full"></div>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
          </svg>
        )}
      </button>
      
      {/* 🔧 FIXED: Centered Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"></div>
          
          {/* Modal Container */}
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <div 
              ref={modalRef}
              className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                      <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-lg font-medium leading-6 text-gray-900">
                        🔗 Share Study
                      </h3>
                      <p className="text-sm text-gray-500">
                        Create shareable links for DICOM viewers
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="ml-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 hover:bg-gray-100 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Study Info */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                      <span className="text-sm font-medium text-blue-600">
                        {study.modality}
                      </span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">{study.patientName}</p>
                    <p className="text-sm text-gray-500">
                      {study.patientId} • {study.description} • {new Date(study.studyDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div className="bg-white px-4 py-5 sm:p-6">
                <div className="space-y-4">
                  {shareOptions.map((option, index) => (
                    <div key={option.viewerType} className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
                      <div className="flex items-center mb-3">
                        <span className="text-2xl mr-3">{option.icon}</span>
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900">{option.name}</h4>
                          <p className="text-xs text-gray-500">{option.description}</p>
                        </div>
                      </div>
                      
                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleShare(option.viewerType, 'copy')}
                          className="flex items-center justify-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                          disabled={isGenerating}
                        >
                          📋 Copy Link
                        </button>
                        <button
                          onClick={() => handleShare(option.viewerType, 'qr')}
                          className="flex items-center justify-center px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition-colors"
                          disabled={isGenerating}
                        >
                          📱 QR Code
                        </button>
                        <button
                          onClick={() => handleShare(option.viewerType, 'share')}
                          className="flex items-center justify-center px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition-colors"
                          disabled={isGenerating}
                        >
                          📤 Share
                        </button>
                        <button
                          onClick={() => handleShare(option.viewerType, 'email')}
                          className="flex items-center justify-center px-3 py-2 text-sm bg-green-100 hover:bg-green-200 text-green-700 rounded transition-colors"
                          disabled={isGenerating}
                        >
                          ✉️ Email
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-4 py-3 sm:px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm text-yellow-800">
                    <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span>🔒 Links expire in 7 days for security</span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Loading Overlay */}
              {isGenerating && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-purple-500 border-t-transparent mx-auto mb-2"></div>
                    <p className="text-sm text-gray-600">Generating shareable link...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ShareButton;