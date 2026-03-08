import unittest

from src.chunking.chunker import chunk_transactions


class ChunkerTests(unittest.TestCase):
    def test_chunk_transactions_even(self) -> None:
        data = list(range(100))
        chunks = chunk_transactions(data, batch_size=20)
        self.assertEqual(len(chunks), 5)
        self.assertTrue(all(len(chunk) == 20 for chunk in chunks))

    def test_chunk_transactions_uneven(self) -> None:
        data = list(range(45))
        chunks = chunk_transactions(data, batch_size=20)
        self.assertEqual(len(chunks), 3)
        self.assertEqual([len(c) for c in chunks], [20, 20, 5])


if __name__ == "__main__":
    unittest.main()
