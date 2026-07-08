package com.secureprint.backend.service;

import com.mongodb.client.gridfs.model.GridFSFile;
import com.secureprint.backend.model.FileMetadata;
import com.secureprint.backend.repository.FileMetadataRepository;
import com.secureprint.backend.security.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class FileService {

    @Autowired
    private GridFsTemplate gridFsTemplate;

    @Autowired
    private EncryptionService encryptionService;

    @Autowired
    private FileMetadataRepository metadataRepository;

    @Autowired
    private JwtUtil jwtUtil;

    public FileMetadata uploadAndEncrypt(MultipartFile file) throws Exception {
        byte[] encryptedData = encryptionService.encrypt(file.getBytes());
        InputStream inputStream = new ByteArrayInputStream(encryptedData);
        
        String gridFsId = gridFsTemplate.store(inputStream, file.getOriginalFilename(), file.getContentType()).toString();
        
        FileMetadata metadata = new FileMetadata();
        metadata.setGridFsId(gridFsId);
        metadata.setFileName(file.getOriginalFilename());
        metadata.setCreatedAt(LocalDateTime.now());
        metadata.setExpiryTime(LocalDateTime.now().plusMinutes(30)); // 30 mins expiry
        metadata.setPrinted(false);
        
        // Generate initial JWT
        String token = jwtUtil.generateToken(gridFsId, 30);
        metadata.setJwtToken(token);
        
        return metadataRepository.save(metadata);
    }

    public byte[] getDecryptedFile(String token) throws Exception {
        if (!jwtUtil.validateToken(token)) {
            throw new RuntimeException("Invalid or expired token");
        }

        Optional<FileMetadata> metadataOpt = metadataRepository.findByJwtToken(token);
        if (metadataOpt.isEmpty() || metadataOpt.get().isPrinted()) {
            throw new RuntimeException("File not found or already printed");
        }

        FileMetadata metadata = metadataOpt.get();
        GridFSFile gridFSFile = gridFsTemplate.findOne(new Query(Criteria.where("_id").is(metadata.getGridFsId())));
        
        if (gridFSFile == null) {
            throw new RuntimeException("File not found in storage");
        }

        GridFsResource resource = gridFsTemplate.getResource(gridFSFile);
        byte[] encryptedData = resource.getInputStream().readAllBytes();

        byte[] decryptedData = encryptionService.decrypt(encryptedData);

        // Enforce one-time access at the backend layer: after first successful open,
        // remove both file content and token metadata so the link cannot be reused.
        cleanup(token);

        return decryptedData;
    }

    public void cleanup(String token) {
        Optional<FileMetadata> metadataOpt = metadataRepository.findByJwtToken(token);
        if (metadataOpt.isPresent()) {
            FileMetadata metadata = metadataOpt.get();
            gridFsTemplate.delete(new Query(Criteria.where("_id").is(metadata.getGridFsId())));
            metadataRepository.delete(metadata);
        }
    }
}
