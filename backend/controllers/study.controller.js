const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Study = require('../models/Study');

const ORTHANC_URL = 'http://ORTHANC_IP:8042';

exports.receiveStudy = async (req, res) => {
  try {
    const studyId = req.body.StudyInstanceUID || req.body.ID; // Orthanc may send different keys

    if (!studyId) return res.status(400).send('Missing StudyInstanceUID');

    // Avoid duplicate inserts
    const exists = await Study.findOne({ studyId });
    if (exists) return res.status(200).send('Already stored');

    // Fetch metadata
    const metaRes = await axios.get(`${ORTHANC_URL}/studies/${studyId}`);
    const meta = metaRes.data;

    const studyPath = path.join(__dirname, '..', 'studies', studyId);
    fs.mkdirSync(studyPath, { recursive: true });

    // Save metadata file
    fs.writeFileSync(path.join(studyPath, 'metadata.json'), JSON.stringify(meta, null, 2));

    // Save instances
    const instanceIds = meta.Instances;
    for (const instanceId of instanceIds) {
      const file = await axios.get(`${ORTHANC_URL}/instances/${instanceId}/file`, {
        responseType: 'arraybuffer',
      });
      fs.writeFileSync(path.join(studyPath, `${instanceId}.dcm`), file.data);
    }

    // Save to MongoDB
    await Study.create({
      studyId,
      patientName: meta.MainDicomTags.PatientName,
      modality: meta.MainDicomTags.Modality,
      studyDate: meta.MainDicomTags.StudyDate,
      studyDescription: meta.MainDicomTags.StudyDescription,
      instances: instanceIds
    });

    res.status(200).send('Study stored');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Error storing study');
  }
};
