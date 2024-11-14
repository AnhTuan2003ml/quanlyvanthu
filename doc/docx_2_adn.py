from docx import Document
from huffman import huffman_encode

from bin_adn import convert_binary_file_to_dna
# Đọc nội dung của cuốn sách từ tệp .docx
def read_book(filename):
    doc = Document(filename)
    content = []
    for paragraph in doc.paragraphs:
        content.append(paragraph.text)
    return '\n'.join(content)



# Chuyển đổi nội dung thành chuỗi nhị phân
def content_to_binary(content):
    binary_values = []
    for char in content:
        # Chuyển ký tự thành mã ASCII và sau đó sang nhị phân
        binary_char = format(ord(char), '08b')  # 08b để đảm bảo mỗi ký tự có 8 bit
        binary_values.append(binary_char)
    return ' '.join(binary_values)

file_hu = "Json\\huffman.json"
file_en = "Data\\encode.txt"
book_content = read_book("TEXT2ADN\\ADN.docx")
binary_representation = content_to_binary(book_content)
print("len bit: ",len(binary_representation))
huffman_encode(book_content,file_hu,file_en)
convert_binary_file_to_dna(file_en ,"atgx.txt")