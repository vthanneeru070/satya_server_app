const DeitySchema = new mongoose.Schema({
    name: { type: String, required: true },
  
    otherNames: [String], // Ganapati, Vinayaka etc
  
    meaning: String, // meaning of name
  
    divineRole: String, // God of wisdom, remover of obstacles
  
    description: String, // short overview
  
    family: {
      parents: [String],
      siblings: [String],
      associations: [String]
    },
  
    iconography: {
      posture: String,
      appearance: String,
      vehicle: String
    },
  
    symbolism: [
      {
        title: String,
        meaning: String
      }
    ],
  
    spiritual: {
      whyPray: String,
      qualities: [String],
      chakra: String
    },
  
    astrology: {
      planet: String,
      number: String,
      notes: String
    },
  
    specialNotes: String,
  
    invocation: {
      howToPray: String,
      whatPleases: String,
      whatDispleases: String
    },
  
    mantra: {
      text: String,
      repetitions: String,
      instructions: String
    },
  
    worship: {
      preferredDays: [String],
      color: String
    },
  
    homeSetup: {
      placement: String,
      environment: String,
      offerings: [String]
    },
  
    experience: {
      signsOfBlessings: String,
      devoteeNotes: String
    },
  
    stories: [
      {
        title: String,
        content: String
      }
    ],
  
    media: {
      images: [String], // S3 URLs
      audio: [String],
      videos: [String]
    },
  
    status: {
      type: String,
      enum: ['DRAFT', 'QUEUED', 'APPROVED','REJECTED','PENDING'],
      default: 'DRAFT'
    },
  
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
  
  }, { timestamps: true });